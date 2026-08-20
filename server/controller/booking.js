const Booking = require("../models/booking");
const Bus = require("../models/bus");
const Route = require("../models/route");
const Customer = require("../models/customer");
const SeatLock = require("../models/seatLock");
const PaymentAttempt = require("../models/paymentAttempt");
const { reserveSeatsAtomically, reserveSeatsSegment, releaseSeats, releaseSegmentSeats, getSoldSeats, getSegmentSoldSeats } = require("./seatReservation");
const notificationService = require("../services/notificationService");
const { generateTicketPdf } = require("../services/pdfTicket");
const { sendTicketEmail } = require("../services/ticketMailer");
const { broadcastSeatsBooked, broadcastSeatsReleased } = require("../services/socket");
const { tReq, resolveLang } = require("../services/i18n");
const { calculateFare: computeFare, calculateSegmentDistance, calculateOccupancy } = require("../services/fareService");
const {
  generatePnr,
  generateTransactionId,
  signQrPayload,
  verifyQrPayload,
  PAYMENT_EXPIRY_MS,
} = require("../utils/bookingRef");

async function validateBookingFare(busId, routeId, seats, boardingStopSequence, droppingStopSequence, sentFare) {
  try {
    const route = await Route.findById(routeId).lean().exec();
    if (!route || !route.fareConfig) return { valid: true };
    const bus = await Bus.findById(busId).lean().exec();
    if (!bus) return { valid: true };
    
    const distanceKm = (boardingStopSequence && droppingStopSequence)
      ? calculateSegmentDistance(route.stops || [], boardingStopSequence, droppingStopSequence)
      : (route.totalDistanceKm || 0);
    
    const seatCount = Array.isArray(seats) ? seats.length : 1;
    const fareConfig = route.fareConfig;
    
    const computed = computeFare(fareConfig, {
      distanceKm,
      busType: bus.busType || 'standard',
      seatType: 'regular',
      occupancyPercent: 50,
      isWeekend: [0, 6].includes(new Date().getDay()),
      totalSeats: bus.totalSeats || 40,
      seatCount,
    });
    
    const tolerance = 50;
    const diff = Math.abs(computed.totalForSeats - sentFare);
    if (diff > tolerance) {
      return { valid: false, expectedFare: computed.totalForSeats, computed };
    }
    return { valid: true, computedFare: computed.totalForSeats };
  } catch (err) {
    console.error("[fareValidation] error:", err.message);
    return { valid: true };
  }
}

// The Angular frontend carries selected seats through route params, which
// Angular serializes to a comma-joined string (e.g. "12,13"). Normalize any
// form — number[], comma-separated string, or single number — into a number[]
// of positive integers so validation, seat-locking and Booking.create all see
// the same clean shape.
function normalizeSeats(value) {
  if (Array.isArray(value)) {
    return value
      .map(Number)
      .filter((n) => Number.isInteger(n) && n > 0);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map(Number)
      .filter((n) => Number.isInteger(n) && n > 0);
  }
  const single = Number(value);
  return Number.isInteger(single) && single > 0 ? [single] : [];
}

function isOwner(booking, req) {
  return (
    String(booking.customerId) === String(req.userId) ||
    req.user?.isAdmin === true
  );
}

// Legacy bookings created before PNR support are identified by their object id
// tail, keeping old tickets/trips readable.
function displayPnr(booking) {
  return booking.pnr || String(booking._id).slice(-8).toUpperCase();
}

async function resolveBusDetails(busId) {
  try {
    const bus = await Bus.findById(busId).lean().exec();
    if (!bus) return {};
    return {
      operatorName: bus.operatorName || "",
      busType: bus.busType || "",
      image: bus.images || "",
      departureTime: bus.departureTime || "",
    };
  } catch (e) {
    return {};
  }
}

async function uniquePnr() {
  for (let i = 0; i < 5; i++) {
    const pnr = generatePnr();
    // eslint-disable-next-line no-await-in-loop
    const exists = await Booking.exists({ pnr }).exec();
    if (!exists) return pnr;
  }
  // Astronomically unlikely to collide 5 times; fall back to a timestamped key.
  return `TED${Date.now()}`;
}

// Resolves the recipient email for the ticket email. Always uses the
// authenticated customer's email from MongoDB (never trusts req.body).
async function resolveCustomerEmail(customerId) {
  try {
    const customer = await Customer.findById(customerId).select("email").lean().exec();
    return customer ? customer.email : null;
  } catch (e) {
    return null;
  }
}

// Generates PDF + sends ticket email. Fire-and-forget: never blocks the
// booking response. Logs detailed status for debugging.
async function sendBookingTicketEmail(booking, busDetails, customerId, lang) {
  const email = await resolveCustomerEmail(customerId);
  if (!email) {
    console.error("[EMAIL] Booking confirmation skipped: customer email not found for user " + customerId);
    return false;
  }
  console.log("[EMAIL] Preparing booking confirmation for PNR " + (booking.pnr || "N/A"));
  console.log("[EMAIL] Recipient: " + email.replace(/(.{2}).*(@.*)/, "$1***$2"));
  try {
    const pdfBuffer = await generateTicketPdf(booking, busDetails, lang);
    if (!pdfBuffer || !pdfBuffer.length) {
      console.error("[EMAIL] PDF generation returned empty buffer.");
      return false;
    }
    console.log("[EMAIL] PDF generated (" + pdfBuffer.length + " bytes)");
    const sent = await sendTicketEmail(booking, pdfBuffer, email, lang);
    if (sent) {
      console.log("[EMAIL] Booking confirmation sent successfully for PNR " + (booking.pnr || "N/A"));
    } else {
      console.warn("[EMAIL] Booking confirmation NOT sent for PNR " + (booking.pnr || "N/A") + " — see ticketMailer logs above");
    }
    return sent;
  } catch (err) {
    console.error("[EMAIL] Sending failed for PNR " + (booking.pnr || "N/A") + ":", err.message);
    return false;
  }
}

function buildQrPayload(booking, busDetails) {  const firstPassenger = (booking.passengerDetails || [])[0];
  return {
    v: 1,
    pnr: booking.pnr,
    bookingId: String(booking._id),
    passenger: firstPassenger ? firstPassenger.name : (booking.email || ""),
    seats: booking.seats || [],
    operator: (busDetails && busDetails.operatorName) || (booking.busDetails || {}).operatorName || "TEDBUS",
    date: booking.departureDetails?.date || "",
    paymentStatus: booking.paymentStatus || "verified",
    ts: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Simulated gateway verification. There is no real payment gateway in the
// project, so "paying" just creates a PaymentAttempt marked verified with a
// short expiry window. The attempt is the idempotency + expiry + duplicate-
// payment guard consumed later by addbooking.
// ---------------------------------------------------------------------------
exports.verifyPayment = async (req, res) => {
  // requireAuth guarantees req.userId is the authenticated customer. The
  // customerId in the body is ignored so a guest can never open a payment
  // attempt on someone else's account.
  const { paymentReference, amount, method } = req.body;
  const customerId = req.userId;
  if (!paymentReference || !customerId || !(Number(amount) >= 0)) {
    return res.status(400).send({ error: tReq(req, "booking.verifyFields") });
  }

  const existing = await PaymentAttempt.findOne({ paymentReference }).lean().exec();

  if (existing) {
    if (existing.status === "used") {
      return res
        .status(409)
        .send({ error: tReq(req, "booking.paymentUsed") });
    }
    if (existing.status === "expired" || (existing.expiresAt && existing.expiresAt.getTime() < Date.now())) {
      await PaymentAttempt.updateOne({ paymentReference }, { status: "expired" });
      return res
        .status(410)
        .send({ error: tReq(req, "booking.paymentExpired") });
    }
    // Idempotent — same reference returns the same verified attempt (never a
    // second charge, and never a second transaction id).
    return res.send({
      success: existing.status === "verified",
      status: existing.status,
      transactionId: existing.transactionId,
      paymentReference: existing.paymentReference,
      expiresAt: existing.expiresAt,
      amount: existing.amount,
      method: existing.method,
    });
  }

  const attempt = await PaymentAttempt.create({
    paymentReference,
    customerId,
    amount: Number(amount),
    method: method || "upi",
    status: "verified",
    transactionId: generateTransactionId(),
    expiresAt: new Date(Date.now() + PAYMENT_EXPIRY_MS),
  });

  res.send({
    success: true,
    status: attempt.status,
    transactionId: attempt.transactionId,
    paymentReference: attempt.paymentReference,
    expiresAt: attempt.expiresAt,
    amount: attempt.amount,
    method: attempt.method,
  });
};

// ---------------------------------------------------------------------------
// Booking creation. When a paymentReference is supplied (new flow) the booking
// is only created if the payment was verified, not expired and not already
// consumed. Without a reference (legacy callers) the old behaviour is kept so
// nothing that already relies on POST /booking breaks.
// ---------------------------------------------------------------------------
exports.addbooking = async (req, res) => {
  const { busId, departureDetails, paymentReference, paymentMethod } = req.body;
  const seats = normalizeSeats(req.body.seats);

  if (!busId || seats.length === 0 || !departureDetails?.date) {
    return res.status(400).send({ error: tReq(req, "booking.fieldsRequired") });
  }

  // Identity is taken from the verified JWT, never from the request body.
  // This is what stops a guest from crafting a booking on another account.
  const customerId = req.userId;

  let attempt = null;
  let fare = Number(req.body.fare);

  // New payment-verified flow.
  if (paymentReference) {
    attempt = await PaymentAttempt.findOne({ paymentReference }).lean().exec();
    if (!attempt) {
      return res.status(400).send({ error: tReq(req, "booking.paymentNotVerified") });
    }
    if (attempt.status === "used") {
      return res
        .status(409)
        .send({ error: tReq(req, "booking.paymentUsed") });
    }
    if (attempt.status === "expired" || (attempt.expiresAt && attempt.expiresAt.getTime() < Date.now())) {
      await PaymentAttempt.updateOne({ paymentReference }, { status: "expired" });
      return res
        .status(410)
        .send({ error: tReq(req, "booking.paymentExpired") });
    }
    if (attempt.status !== "verified") {
      return res.status(400).send({ error: tReq(req, "booking.paymentVerifyFailed") });
    }
    // The verified amount is authoritative — prevents fare tampering.
    fare = attempt.amount;

    // Server-side fare validation
    const routeId = req.body.routeId;
    if (routeId && req.body.busId) {
      const fareCheck = await validateBookingFare(req.body.busId, routeId, seats, req.body.boardingStopSequence, req.body.droppingStopSequence, fare);
      if (!fareCheck.valid) {
        return res.status(400).json({ error: "Fare mismatch. Please refresh and try again.", expectedFare: fareCheck.expectedFare });
      }
      if (fareCheck.computedFare) {
        fare = fareCheck.computedFare;
      }
    }
  }

  try {
    // Determine if segment info is present — if so, use segment-aware lock
    const fromSeq = req.body.boardingStopSequence != null ? parseInt(req.body.boardingStopSequence, 10) : null;
    const toSeq = req.body.droppingStopSequence != null ? parseInt(req.body.droppingStopSequence, 10) : null;
    const useSegmentLock = fromSeq != null && toSeq != null && !isNaN(fromSeq) && !isNaN(toSeq) && fromSeq < toSeq;

    let reservation;
    if (useSegmentLock) {
      const segmentBookings = seats.map((seatNo) => ({
        seatNumber: seatNo,
        boardingSequence: fromSeq,
        droppingSequence: toSeq,
        bookingId: "pending",
        lockedAt: new Date(),
      }));
      reservation = await reserveSeatsSegment(busId, departureDetails.date, segmentBookings);
    } else {
      reservation = await reserveSeatsAtomically(busId, departureDetails.date, seats);
    }

    if (!reservation.success) {
      return res.status(409).send({
        error: tReq(req, "booking.errSeatsTaken"),
        conflictingSeats: reservation.conflictingSeats,
      });
    }

    try {
      const pnr = await uniquePnr();
      const busDetails = await resolveBusDetails(busId);
      const bookingData = {
        ...req.body,
        customerId, // authenticated user — never trust the body's customerId
        seats,
        fare,
        pnr,
        busDetails,
        paymentStatus: attempt ? "verified" : "verified",
        paymentReference: paymentReference || "",
        transactionId: attempt ? attempt.transactionId : "",
        paymentMethod: paymentMethod || (attempt && attempt.method) || "",
        paymentTime: attempt ? attempt.createdAt || new Date() : new Date(),
        status: attempt ? "ticket_confirmed" : "upcoming",
        boardingStopSequence: useSegmentLock ? fromSeq : null,
        droppingStopSequence: useSegmentLock ? toSeq : null,
        boardingStopName: req.body.boardingStopName || "",
        droppingStopName: req.body.droppingStopName || "",
        segmentDistanceKm: req.body.segmentDistanceKm || 0,
        journeyDate: departureDetails.date,
        fareSnapshot: req.body.fareSnapshot || null,
        timeline: [
          { status: "booked", at: new Date() },
          ...(attempt
            ? [
                { status: "payment_verified", at: new Date() },
                { status: "ticket_confirmed", at: new Date() },
              ]
            : []),
        ],
      };

      // Sign the QR payload after creation so it references the real _id.
      const booking = await Booking.create(bookingData);

      // Update segment bookings with real booking ID
      if (useSegmentLock) {
        await SeatLock.updateOne(
          { busId, date: departureDetails.date },
          {
            $set: {
              "segmentBookings.$[elem].bookingId": String(booking._id),
            },
          },
          {
            arrayFilters: [{ "elem.seatNumber": { $in: seats }, "elem.bookingId": "pending" }],
          }
        );
      }

      booking.qrPayload = signQrPayload(buildQrPayload(booking, busDetails));
      await booking.save();

      if (attempt) {
        await PaymentAttempt.updateOne(
          { paymentReference },
          { status: "used", bookingId: String(booking._id) }
        );
      }

      console.log("Booking created:", booking.pnr);

      // Push the just-confirmed seats to every other user watching this
      // bus+date so their seat map flips to SOLD immediately.
      try {
        broadcastSeatsBooked(busId, departureDetails.date, seats);
      } catch (broadcastError) {
        console.error("seat broadcast error:", broadcastError.message);
      }

      // PDF ticket + email (fire-and-forget; never block booking success).
      // Uses the authenticated customer's email from MongoDB, not req.body.
      sendBookingTicketEmail(booking, busDetails, customerId, resolveLang(req)).catch(
        (err) => console.error("[EMAIL] ticket email pipeline error:", err.message)
      );

      notificationService.notifyBookingConfirmed(booking).catch((err) =>
        console.error("booking notification error:", err.message)
      );
      if (attempt) {
        notificationService.notifyPaymentSuccessful(booking, attempt.amount).catch((err) =>
          console.error("payment notification error:", err.message)
        );
      }

      return res.send(booking);
    } catch (bookingError) {
      // Booking record failed to save after seats were reserved — release
      // the reservation so those seats don't stay locked for nothing.
      if (useSegmentLock) {
        await releaseSegmentSeats(busId, departureDetails.date, "pending");
      }
      await releaseSeats(busId, departureDetails.date, seats);
      throw bookingError;
    }
  } catch (error) {
    console.error("Error creating booking:", error);
    return res.status(500).send({ error: tReq(req, "booking.errCreate") });
  }
};

// ---------------------------------------------------------------------------
// Pre-payment seat validation. Returns the authoritative sold list for a
// (busId, date) and — when a seat selection is supplied — which of those seats
// are no longer available. Used by the frontend right before sending a user to
// the payment page so nobody pays for a seat someone just took.
// ---------------------------------------------------------------------------
exports.validateSeats = async (req, res) => {
  const { busId, date, boardingSequence, droppingSequence } = req.body || {};
  if (!busId || !date) {
    return res.status(400).send({ error: tReq(req, "booking.validateFields") });
  }
  try {
    // When segment info is provided, use segment-aware validation
    const fromSeq = boardingSequence != null ? parseInt(boardingSequence, 10) : null;
    const toSeq = droppingSequence != null ? parseInt(droppingSequence, 10) : null;

    let soldSeats;
    if (fromSeq != null && toSeq != null && !isNaN(fromSeq) && !isNaN(toSeq)) {
      soldSeats = await getSegmentSoldSeats(String(busId), String(date), fromSeq, toSeq, 40);
    } else {
      soldSeats = await getSoldSeats(String(busId), String(date));
    }

    const requested = Array.isArray(req.body.seats)
      ? req.body.seats.map(Number).filter((n) => Number.isInteger(n) && n > 0)
      : [];
    const conflicts = requested.filter((seat) => soldSeats.includes(seat));
    res.send({
      success: conflicts.length === 0,
      soldSeats,
      conflicts,
      seatsLeft: Math.max(0, 40 - soldSeats.length),
    });
  } catch (error) {
    console.error("validateSeats error:", error.message);
    res.status(500).send({ error: tReq(req, "booking.errValidate") });
  }
};

exports.getBooking = async (req, res) => {
  // Protected by requireAuth — only ever returns the authenticated customer's
  // own bookings. The :id in the URL is ignored; identity comes from the JWT.
  const bookings = await Booking.find({ customerId: req.userId })
    .sort({ createdAt: -1 })
    .lean()
    .exec();
  res.send(bookings);
};

// ---------------------------------------------------------------------------
// Ticket lookups (protected — a user can only see their own ticket).
// ---------------------------------------------------------------------------
exports.getTicketByPnr = async (req, res) => {
  try {
    const { pnr } = req.params;
    const booking = await Booking.findOne({ pnr }).lean().exec();
    if (!booking) return res.status(404).send({ error: tReq(req, "booking.ticketNotFound") });
    if (!isOwner(booking, req)) {
      return res.status(403).send({ error: tReq(req, "booking.ownTicketOnly") });
    }
    // Backfill a QR payload for legacy bookings so every ticket can be scanned.
    if (!booking.qrPayload) {
      const busDetails = booking.busDetails || {};
      const payload = signQrPayload(buildQrPayload(booking, busDetails));
      await Booking.updateOne({ _id: booking._id }, { qrPayload: payload });
      booking.qrPayload = payload;
    }
    booking.displayPnr = displayPnr(booking);
    res.send(booking);
  } catch (error) {
    console.error("Error fetching ticket:", error);
    res.status(500).send({ error: tReq(req, "booking.errLoadTicket") });
  }
};

exports.downloadTicketPdf = async (req, res) => {
  try {
    const { pnr } = req.params;
    const booking = await Booking.findOne({ pnr }).exec();
    if (!booking) return res.status(404).send({ error: tReq(req, "booking.ticketNotFound") });
    if (!isOwner(booking, req)) {
      return res.status(403).send({ error: tReq(req, "booking.ownDownloadOnly") });
    }
    if (!booking.qrPayload) {
      const busDetails = booking.busDetails || {};
      booking.qrPayload = signQrPayload(buildQrPayload(booking, busDetails));
      await booking.save();
    }
    const pdfBuffer = await generateTicketPdf(booking, booking.busDetails || {}, resolveLang(req));
    const inline = req.query.inline === "1";
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `${inline ? "inline" : "attachment"}; filename="TEDBUS_${displayPnr(booking)}.pdf"`
    );
    res.setHeader("Content-Length", pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (error) {
    console.error("Error generating PDF:", error);
    res.status(500).send({ error: tReq(req, "booking.errPdf") });
  }
};

exports.emailTicket = async (req, res) => {
  try {
    const { pnr } = req.params;
    const booking = await Booking.findOne({ pnr }).exec();
    if (!booking) return res.status(404).send({ error: tReq(req, "booking.ticketNotFound") });
    if (!isOwner(booking, req)) {
      return res.status(403).send({ error: tReq(req, "booking.ownEmailOnly") });
    }
    if (!booking.qrPayload) {
      const busDetails = booking.busDetails || {};
      booking.qrPayload = signQrPayload(buildQrPayload(booking, busDetails));
      await booking.save();
    }
    // Use the authenticated user's email from MongoDB, not booking.email.
    const email = await resolveCustomerEmail(req.userId);
    if (!email) {
      return res.status(400).send({ error: "Customer email not found." });
    }
    const pdfBuffer = await generateTicketPdf(booking, booking.busDetails || {}, resolveLang(req));
    const sent = await sendTicketEmail(booking, pdfBuffer, email, resolveLang(req));
    res.send({ sent, message: sent ? tReq(req, "booking.ticketEmailed") : tReq(req, "booking.emailNotConfigured") });
  } catch (error) {
    console.error("Error emailing ticket:", error);
    res.status(500).send({ error: tReq(req, "booking.errEmail") });
  }
};

// ---------------------------------------------------------------------------
// Driver verification. Public on purpose — the conductor scanning the QR is not
// a logged-in customer. The QR payload is HMAC-signed, so a tampered QR fails
// signature verification before any booking data is consulted.
// ---------------------------------------------------------------------------
exports.verifyTicket = async (req, res) => {
  const { qrData, pnr: manualPnr } = req.body || {};
  let pnr = "";
  let qrVerified = false;

  if (qrData) {
    const payload = verifyQrPayload(qrData);
    if (!payload || !payload.pnr) {
      return res.status(400).send({ error: tReq(req, "booking.qrInvalid") });
    }
    pnr = payload.pnr;
    qrVerified = true;
  } else if (manualPnr) {
    pnr = String(manualPnr).trim();
  } else {
    return res.status(400).send({ error: tReq(req, "booking.qrOrPnrRequired") });
  }

  const booking = await Booking.findOne({ pnr }).lean().exec();
  if (!booking) {
    return res.status(404).send({ error: tReq(req, "booking.pnrNotFound") });
  }

  // For QR scans, the payload must also reference this exact booking.
  if (qrVerified) {
    const payload = verifyQrPayload(qrData);
    if (String(payload.bookingId) !== String(booking._id)) {
      return res.status(400).send({ error: tReq(req, "booking.qrMismatch") });
    }
  }

  const cancelled = booking.status === "cancelled";
  const paid = (booking.paymentStatus || "verified") === "verified";
  const confirmed =
    paid &&
    !cancelled &&
    ["upcoming", "ticket_confirmed", "payment_verified"].includes(booking.status);

  const firstPassenger = (booking.passengerDetails || [])[0];
  const busDetails = booking.busDetails || {};

  return res.send({
    valid: !cancelled,
    allowedToBoard: !!confirmed,
    booking: {
      pnr: booking.pnr || displayPnr(booking),
      passengerName: firstPassenger ? firstPassenger.name : (booking.email || ""),
      operator: busDetails.operatorName || "TEDBUS",
      busType: busDetails.busType || "",
      journey: `${booking.departureDetails?.city || ""} → ${booking.arrivalDetails?.city || ""}`,
      date: booking.departureDetails?.date || "",
      departure: booking.departureDetails?.time !== undefined ? `${booking.departureDetails.time}:00` : "",
      arrival: booking.arrivalDetails?.time !== undefined ? `${booking.arrivalDetails.time}:00` : "",
      seats: booking.seats || [],
      paymentStatus: booking.paymentStatus || "verified",
      bookingStatus: cancelled ? "cancelled" : booking.status,
    },
  });
};

exports.cancelBooking = async (req, res) => {
  const { id } = req.params;
  try {
    const booking = await Booking.findById(id).exec();
    if (!booking) return res.status(404).send({ error: tReq(req, "booking.notFound") });
    if (!isOwner(booking, req)) {
      return res.status(403).send({ error: tReq(req, "booking.ownBookingOnly") });
    }
    if (booking.status === "cancelled") {
      return res.send(booking);
    }
    booking.status = "cancelled";
    booking.timeline = booking.timeline || [];
    booking.timeline.push({ status: "cancelled", at: new Date() });
    await booking.save();
    await releaseSeats(String(booking.busId), String(booking.departureDetails?.date || ""), booking.seats || []);
    // Also release segment bookings if they exist
    if (booking.boardingStopSequence != null && booking.droppingStopSequence != null) {
      await releaseSegmentSeats(String(booking.busId), String(booking.departureDetails?.date || ""), String(booking._id));
    }
    try {
      broadcastSeatsReleased(String(booking.busId), String(booking.departureDetails?.date || ""), booking.seats || []);
    } catch (broadcastError) {
      console.error("seat release broadcast error:", broadcastError.message);
    }
    notificationService.notifyBookingCancelled(booking).catch((err) =>
      console.error("cancellation notification error:", err.message)
    );
    notificationService.notifyTicketCancelled(booking).catch((err) =>
      console.error("ticket cancellation notification error:", err.message)
    );
    res.send(booking);
  } catch (error) {
    console.error("Error cancelling booking:", error);
    res.status(500).send({ error: tReq(req, "booking.errCancel") });
  }
};

// ---------------------------------------------------------------------------
// Segment-aware fare calculation.
// POST /booking/calculate-fare
// Body: { routeId, busId, date, fromSequence, toSequence, seats, seatType }
// ---------------------------------------------------------------------------
exports.calculateFare = async (req, res) => {
  try {
    const { routeId, busId, date, fromSequence, toSequence, seats, seatType } = req.body;
    if (!routeId || !fromSequence || !toSequence) {
      return res.status(400).send({ error: "Missing required fields" });
    }

    const route = await Route.findById(routeId).lean().exec();
    if (!route) {
      return res.status(404).send({ error: "Route not found" });
    }

    const bus = busId ? await Bus.findById(busId).lean().exec() : null;
    const distance = calculateSegmentDistance(
      route.stops,
      parseInt(fromSequence, 10),
      parseInt(toSequence, 10)
    );

    // Calculate occupancy for dynamic pricing
    let occupancyPercent = 0;
    if (busId && date) {
      const soldSeats = await getSegmentSoldSeats(
        busId, date,
        parseInt(fromSequence, 10),
        parseInt(toSequence, 10),
        (bus && bus.totalSeats) || 40
      );
      occupancyPercent = calculateOccupancy(soldSeats.length, (bus && bus.totalSeats) || 40);
    }

    const isWeekend = (() => {
      if (!date) return false;
      const d = new Date(date + "T12:00:00+05:30");
      const day = d.getDay();
      return day === 0 || day === 6;
    })();

    const fare = computeFare(route.fareConfig, {
      distanceKm: distance,
      busType: bus ? bus.busType : "standard",
      seatType: seatType || "regular",
      occupancyPercent,
      isWeekend,
      totalSeats: bus ? bus.totalSeats : 40,
      seatCount: (seats && seats.length) || 1,
    });

    res.send({
      success: true,
      fare,
      segment: {
        distanceKm: distance,
        occupancyPercent,
        isWeekend,
        busType: bus ? bus.busType : "standard",
      },
    });
  } catch (error) {
    console.error("calculateFare error:", error);
    res.status(500).send({ error: "Error calculating fare" });
  }
};

// ---------------------------------------------------------------------------
// Segment-aware booking creation.
// POST /booking/segment
// Body: same as POST /booking + boardingStopSequence, droppingStopSequence,
//       boardingStopName, droppingStopName, segmentDistanceKm, fareSnapshot
// ---------------------------------------------------------------------------
exports.addSegmentBooking = async (req, res) => {
  const { busId, departureDetails, paymentReference, paymentMethod,
    boardingStopSequence, droppingStopSequence,
    boardingStopName, droppingStopName, segmentDistanceKm, fareSnapshot } = req.body;
  const seats = normalizeSeats(req.body.seats);

  if (!busId || seats.length === 0 || !departureDetails?.date) {
    return res.status(400).send({ error: tReq(req, "booking.fieldsRequired") });
  }

  const customerId = req.userId;

  let attempt = null;
  let fare = Number(req.body.fare);

  if (paymentReference) {
    attempt = await PaymentAttempt.findOne({ paymentReference }).lean().exec();
    if (!attempt) {
      return res.status(400).send({ error: tReq(req, "booking.paymentNotVerified") });
    }
    if (attempt.status === "used") {
      return res.status(409).send({ error: tReq(req, "booking.paymentUsed") });
    }
    if (attempt.status === "expired" || (attempt.expiresAt && attempt.expiresAt.getTime() < Date.now())) {
      await PaymentAttempt.updateOne({ paymentReference }, { status: "expired" });
      return res.status(410).send({ error: tReq(req, "booking.paymentExpired") });
    }
    if (attempt.status !== "verified") {
      return res.status(400).send({ error: tReq(req, "booking.paymentVerifyFailed") });
    }
    fare = attempt.amount;

    // Server-side fare validation
    const segRouteId = req.body.routeId;
    if (segRouteId && req.body.busId) {
      const fareCheck = await validateBookingFare(req.body.busId, segRouteId, seats, boardingStopSequence, droppingStopSequence, fare);
      if (!fareCheck.valid) {
        return res.status(400).json({ error: "Fare mismatch. Please refresh and try again.", expectedFare: fareCheck.expectedFare });
      }
      if (fareCheck.computedFare) {
        fare = fareCheck.computedFare;
      }
    }
  }

  try {
    const fromSeq = parseInt(boardingStopSequence, 10);
    const toSeq = parseInt(droppingStopSequence, 10);

    if (fromSeq >= toSeq) {
      return res.status(400).send({ error: "Boarding stop must be before dropping stop" });
    }

    // Segment-aware seat reservation
    const segmentBookings = seats.map((seatNo) => ({
      seatNumber: seatNo,
      boardingSequence: fromSeq,
      droppingSequence: toSeq,
      bookingId: "pending",
      lockedAt: new Date(),
    }));

    const reservation = await reserveSeatsSegment(busId, departureDetails.date, segmentBookings);

    if (!reservation.success) {
      return res.status(409).send({
        error: tReq(req, "booking.errSeatsTaken"),
        conflictingSeats: reservation.conflictingSeats,
      });
    }

    try {
      const pnr = await uniquePnr();
      const busDetails = await resolveBusDetails(busId);
      const bookingData = {
        ...req.body,
        customerId,
        seats,
        fare,
        pnr,
        busDetails,
        paymentStatus: "verified",
        paymentReference: paymentReference || "",
        transactionId: attempt ? attempt.transactionId : "",
        paymentMethod: paymentMethod || (attempt && attempt.method) || "",
        paymentTime: attempt ? attempt.createdAt || new Date() : new Date(),
        status: "ticket_confirmed",
        boardingStopSequence: fromSeq,
        droppingStopSequence: toSeq,
        boardingStopName: boardingStopName || "",
        droppingStopName: droppingStopName || "",
        segmentDistanceKm: segmentDistanceKm || 0,
        journeyDate: departureDetails.date,
        fareSnapshot: fareSnapshot || {
          baseFare: fare, seatFare: 0, dynamicFare: 0, tax: 0,
          serviceFee: 0, totalFare: fare, pricePerKm: 0, distance: segmentDistanceKm || 0,
        },
        timeline: [
          { status: "booked", at: new Date() },
          { status: "payment_verified", at: new Date() },
          { status: "ticket_confirmed", at: new Date() },
        ],
      };

      const booking = await Booking.create(bookingData);

      // Update segment bookings with real booking ID
      await SeatLock.updateOne(
        { busId, date: departureDetails.date },
        {
          $set: {
            "segmentBookings.$[elem].bookingId": String(booking._id),
          },
        },
        {
          arrayFilters: [{ "elem.seatNumber": { $in: seats }, "elem.bookingId": "pending" }],
        }
      );

      booking.qrPayload = signQrPayload(buildQrPayload(booking, busDetails));
      await booking.save();

      if (attempt) {
        await PaymentAttempt.updateOne(
          { paymentReference },
          { status: "used", bookingId: String(booking._id) }
        );
      }

      try {
        broadcastSeatsBooked(busId, departureDetails.date, seats);
      } catch (broadcastError) {
        console.error("seat broadcast error:", broadcastError.message);
      }

      // PDF ticket + email (fire-and-forget; never block booking success).
      sendBookingTicketEmail(booking, busDetails, customerId, resolveLang(req)).catch(
        (err) => console.error("[EMAIL] ticket email pipeline error:", err.message)
      );

      notificationService.notifyBookingConfirmed(booking).catch((err) =>
        console.error("booking notification error:", err.message)
      );
      if (attempt) {
        notificationService.notifyPaymentSuccessful(booking, attempt.amount).catch((err) =>
          console.error("payment notification error:", err.message)
        );
      }

      return res.send(booking);
    } catch (bookingError) {
      await releaseSegmentSeats(busId, departureDetails.date, "pending");
      await releaseSeats(busId, departureDetails.date, seats);
      throw bookingError;
    }
  } catch (error) {
    console.error("Error creating segment booking:", error);
    return res.status(500).send({ error: tReq(req, "booking.errCreate") });
  }
};
