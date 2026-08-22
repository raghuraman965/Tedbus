const crypto = require("crypto");
const Bus = require("../models/bus");
const Route = require("../models/route");
const PaymentAttempt = require("../models/paymentAttempt");
const {
  getSegmentSoldSeats,
  getSoldSeats,
  validateActiveHold,
} = require("./seatReservation");
const {
  calculateFare: computeFare,
  calculateSegmentDistance,
  calculateOccupancy,
} = require("../services/fareService");
const { generatePaymentReference, PAYMENT_EXPIRY_MS } = require("../utils/bookingRef");
const { tReq } = require("../services/i18n");

// ---------------------------------------------------------------------------
// Razorpay client (lazy). Returns null when keys are not configured so the
// endpoints can answer with a clear 503 instead of crashing.
// ---------------------------------------------------------------------------
let razorpayClient = null;
function getRazorpayClient() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return null;
  if (!razorpayClient) {
    const Razorpay = require("razorpay");
    razorpayClient = new Razorpay({ key_id: keyId, key_secret: keySecret });
  }
  return razorpayClient;
}

function isWeekendForDate(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr + "T12:00:00+05:30");
  if (isNaN(d.getTime())) return false;
  return d.getDay() === 0 || d.getDay() === 6;
}

/**
 * Single source of truth for what a booking costs. Used by BOTH
 * POST /booking/payment/order (what the customer is charged) and the fare
 * re-validation inside booking creation, so the amount can never differ
 * between the gateway, the booking record and the admin panel.
 */
async function computeAuthoritativeFare({
  routeId,
  busId,
  date,
  seats,
  boardingStopSequence,
  droppingStopSequence,
  seatType,
}) {
  const route = await Route.findById(routeId).lean().exec();
  if (!route) throw new Error("ROUTE_NOT_FOUND");
  const bus = await Bus.findById(busId).lean().exec();
  if (!bus) throw new Error("BUS_NOT_FOUND");

  const fromSeq = boardingStopSequence != null ? parseInt(boardingStopSequence, 10) : null;
  const toSeq = droppingStopSequence != null ? parseInt(droppingStopSequence, 10) : null;
  const isSegment = fromSeq != null && toSeq != null && !isNaN(fromSeq) && !isNaN(toSeq) && fromSeq < toSeq;

  const distanceKm = isSegment
    ? calculateSegmentDistance(route.stops || [], fromSeq, toSeq)
    : (route.totalDistanceKm || 0);

  const totalSeats = bus.totalSeats || 40;

  // Real occupancy for THIS bus on THIS date drives dynamic pricing.
  let soldCount = 0;
  if (isSegment) {
    const sold = await getSegmentSoldSeats(String(busId), String(date), fromSeq, toSeq, totalSeats);
    soldCount = sold.length;
  } else {
    const sold = await getSoldSeats(String(busId), String(date));
    soldCount = sold.length;
  }
  const occupancyPercent = calculateOccupancy(soldCount, totalSeats);

  const seatCount = Array.isArray(seats) && seats.length ? seats.length : 1;

  const fare = computeFare(route.fareConfig || {}, {
    distanceKm,
    busType: bus.busType || "standard",
    seatType: seatType || "regular",
    occupancyPercent,
    isWeekend: isWeekendForDate(date),
    totalSeats,
    seatCount,
  });

  return {
    fare,
    distanceKm,
    occupancyPercent,
    isWeekend: isWeekendForDate(date),
    seatCount,
    totalSeats,
  };
}

/**
 * Validates that `holdId` is an ACTIVE hold on (busId, date) covering exactly
 * the requested seats for the requested segment. Implemented once in
 * seatReservation.js and shared with the booking controller so both flows
 * agree on what a live hold looks like.
 */

// ---------------------------------------------------------------------------
// POST /booking/payment/order   (requireAuth)
// Body: { routeId, busId, date, seats, holdId,
//         boardingStopSequence?, droppingStopSequence?, seatType? }
//
// Requires an ACTIVE seat hold covering exactly the requested seats. Computes
// the authoritative fare server-side (never trusts an amount sent by
// Angular), creates a Razorpay order for exactly that amount and records a
// pending PaymentAttempt bound to the hold + booking context.
// ---------------------------------------------------------------------------
exports.createOrder = async (req, res) => {
  const { routeId, busId, date, seats, holdId, boardingStopSequence, droppingStopSequence, seatType } = req.body || {};

  if (!routeId || !busId || !date || !holdId) {
    return res.status(400).send({
      error: tReq(req, "booking.orderFields") || "routeId, busId, date and holdId are required.",
    });
  }
  const cleanSeats = Array.isArray(seats)
    ? seats.map(Number).filter((n) => Number.isInteger(n) && n > 0)
    : [];
  if (cleanSeats.length === 0) {
    return res.status(400).send({ error: tReq(req, "booking.seatRequired") || "At least one seat is required." });
  }

  // The hold must be alive and cover exactly these seats/segment.
  const holdCheck = await validateActiveHold({
    busId,
    date,
    seats: cleanSeats,
    boardingSequence: boardingStopSequence,
    droppingSequence: droppingStopSequence,
    holdId,
  });
  if (!holdCheck.ok) {
    return res.status(409).send({
      error:
        holdCheck.reason === "HOLD_EXPIRED"
          ? tReq(req, "booking.holdExpired") || "Your seat selection expired. Please pick your seats again."
          : tReq(req, "booking.errSeatsTaken"),
      reason: holdCheck.reason,
    });
  }

  const client = getRazorpayClient();
  if (!client) {
    return res.status(503).send({
      error: tReq(req, "booking.gatewayNotConfigured") || "Payment gateway is not configured. Please contact support.",
    });
  }

  try {
    const quote = await computeAuthoritativeFare({
      routeId,
      busId,
      date,
      seats: cleanSeats,
      boardingStopSequence,
      droppingStopSequence,
      seatType,
    });

    // Round to whole rupees — Razorpay amounts are integer paise.
    const amountPaise = Math.round(quote.fare.totalForSeats * 100);
    if (!(amountPaise > 0)) {
      return res.status(400).send({ error: "Computed fare is zero. Please refresh and try again." });
    }

    const paymentReference = generatePaymentReference();
    const receipt = `tb_${paymentReference}`.slice(0, 40);

    const order = await client.orders.create({
      amount: amountPaise,
      currency: "INR",
      receipt,
      notes: {
        busId: String(busId),
        routeId: String(routeId),
        date: String(date),
        seats: cleanSeats.join(","),
        customerId: String(req.userId),
        holdId: String(holdId),
      },
    });

    const attempt = await PaymentAttempt.create({
      paymentReference,
      customerId: req.userId,
      amount: quote.fare.totalForSeats,
      method: "razorpay",
      status: "pending",
      razorpayOrderId: order.id,
      holdId: String(holdId),
      context: {
        routeId: String(routeId),
        busId: String(busId),
        date: String(date),
        seats: cleanSeats,
        boardingStopSequence:
          boardingStopSequence != null && !isNaN(parseInt(boardingStopSequence, 10))
            ? parseInt(boardingStopSequence, 10)
            : null,
        droppingStopSequence:
          droppingStopSequence != null && !isNaN(parseInt(droppingStopSequence, 10))
            ? parseInt(droppingStopSequence, 10)
            : null,
      },
      expiresAt: new Date(Date.now() + PAYMENT_EXPIRY_MS),
    });

    res.send({
      success: true,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
      paymentReference: attempt.paymentReference,
      holdId: attempt.holdId,
      expiresAt: attempt.expiresAt,
      fare: quote.fare,
      context: { routeId, busId, date, seats: cleanSeats },
    });
  } catch (error) {
    if (error.message === "ROUTE_NOT_FOUND") {
      return res.status(404).send({ error: "Route not found." });
    }
    if (error.message === "BUS_NOT_FOUND") {
      return res.status(404).send({ error: "Bus not found." });
    }
    console.error("createOrder error:", error.message);
    res.status(500).send({ error: tReq(req, "booking.errCreate") || "Could not start payment. Please try again." });
  }
};

// ---------------------------------------------------------------------------
// POST /booking/payment/confirm   (requireAuth)
// Body: { paymentReference, razorpay_order_id, razorpay_payment_id, razorpay_signature }
//
// Verifies the Razorpay HMAC-SHA256 signature (order_id|payment_id signed with
// the key secret). Only then is the pending attempt marked `verified`, which is
// the ONLY state a booking creation accepts. A booking is never marked paid
// merely because a button was clicked.
// ---------------------------------------------------------------------------
exports.confirmPayment = async (req, res) => {
  const { paymentReference, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keySecret) {
    return res.status(503).send({ error: "Payment gateway is not configured." });
  }
  if (!paymentReference || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).send({ error: "Missing payment confirmation fields." });
  }

  const attempt = await PaymentAttempt.findOne({ paymentReference }).exec();
  if (!attempt) {
    return res.status(400).send({ error: tReq(req, "booking.paymentNotVerified") });
  }
  // Ownership: an attempt can only be confirmed by the account that opened it.
  if (String(attempt.customerId) !== String(req.userId)) {
    return res.status(403).send({ error: "This payment belongs to another account." });
  }
  if (attempt.status === "used") {
    return res.status(409).send({ error: tReq(req, "booking.paymentUsed") });
  }
  if (attempt.status === "expired" || (attempt.expiresAt && attempt.expiresAt.getTime() < Date.now())) {
    attempt.status = "expired";
    await attempt.save();
    return res.status(410).send({ error: tReq(req, "booking.paymentExpired") });
  }
  if (attempt.razorpayOrderId && attempt.razorpayOrderId !== razorpay_order_id) {
    return res.status(400).send({ error: "Order mismatch for this payment reference." });
  }

  // Idempotent: confirming an already-verified attempt returns success without
  // creating a second charge record.
  if (attempt.status === "verified") {
    return res.send({
      success: true,
      status: attempt.status,
      transactionId: attempt.transactionId,
      paymentReference: attempt.paymentReference,
      amount: attempt.amount,
    });
  }

  // 1) Cryptographic check — HMAC over "order_id|payment_id".
  const expectedSignature = crypto
    .createHmac("sha256", keySecret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");

  const provided = String(razorpay_signature);
  const a = Buffer.from(expectedSignature);
  const b = Buffer.from(provided);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    attempt.status = "failed";
    await attempt.save();
    console.error("[payment] signature mismatch for", paymentReference);
    return res.status(400).send({ error: "Payment signature verification failed." });
  }

  // 2) Best-effort gateway cross-check (amount actually captured). Signature
  //    verification above is already sufficient proof; this catches edge cases
  //    like a refunded/failed capture reported out of band.
  try {
    const client = getRazorpayClient();
    if (client) {
      const payment = await client.payments.fetch(razorpay_payment_id);
      if (payment && payment.status && !["captured", "authorized"].includes(payment.status)) {
        attempt.status = "failed";
        await attempt.save();
        return res.status(402).send({ error: `Payment not completed (status: ${payment.status}).` });
      }
      if (payment && typeof payment.amount === "number" && payment.amount !== Math.round(attempt.amount * 100)) {
        attempt.status = "failed";
        await attempt.save();
        console.error("[payment] amount mismatch", payment.amount, attempt.amount * 100);
        return res.status(400).send({ error: "Payment amount mismatch." });
      }
    }
  } catch (fetchErr) {
    // Network hiccup talking to Razorpay must NOT fail an otherwise validly
    // signed payment — log and continue.
    console.warn("[payment] gateway fetch skipped:", fetchErr.message);
  }

  attempt.status = "verified";
  attempt.transactionId = razorpay_payment_id;
  attempt.razorpayOrderId = razorpay_order_id;
  attempt.razorpayPaymentId = razorpay_payment_id;
  await attempt.save();

  res.send({
    success: true,
    status: attempt.status,
    transactionId: attempt.transactionId,
    paymentReference: attempt.paymentReference,
    amount: attempt.amount,
  });
};

module.exports.computeAuthoritativeFare = computeAuthoritativeFare;
