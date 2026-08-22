const Booking = require("../models/booking");
const Bus = require("../models/bus");
const Route = require("../models/route");
const Customer = require("../models/customer");
const PaymentAttempt = require("../models/paymentAttempt");
const {
  HOLD_TTL_MS,
  holdSeatsSegment,
  confirmHolds,
  repointRows,
  validateActiveHold,
  releaseHold,
  releaseSeats,
  releaseSegmentSeats,
  getSoldSeats,
  getSegmentSoldSeats,
} = require("./seatReservation");
const notificationService = require("../services/notificationService");
const { generateTicketPdf } = require("../services/pdfTicket");
const { sendTicketEmail } = require("../services/ticketMailer");
const { broadcastSeatsBooked, broadcastSeatsReleased } = require("../services/socket");
const { tReq, resolveLang } = require("../services/i18n");
const {
  calculateFare: computeFare,
  calculateSegmentDistance,
  calculateOccupancy,
} = require("../services/fareService");
const {
  generatePnr,
  signQrPayload,
  verifyQrPayload,
} = require("../utils/bookingRef");
const { computeAuthoritativeFare } = require("./payment");
const { computeRefundForBooking } = require("../services/refundService");

// ===========================================================================
// Shared helpers
// ===========================================================================

function normalizeSeats(value) {
  if (Array.isArray(value)) {
    return value.map(Number).filter((n) => Number.isInteger(n) && n > 0);
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
  return `TED${Date.now()}`;
}

async function resolveCustomerEmail(customerId) {
  try {
    const customer = await Customer.findById(customerId).select("email").lean().exec();
    return customer ? customer.email : null;
  } catch (e) {
    return null;
  }
}

// Generates PDF + sends ticket email. Fire-and-forget: never blocks the
// booking response.
async function sendBookingTicketEmail(booking, busDetails, customerId, lang) {
  const email = await resolveCustomerEmail(customerId);
  if (!email) {
    console.error("[EMAIL] Booking confirmation skipped: customer email not found for user " + customerId);
    return false;
  }
  try {
    const pdfBuffer = await generateTicketPdf(booking, busDetails, lang);
    if (!pdfBuffer || !pdfBuffer.length) return false;
    const sent = await sendTicketEmail(booking, pdfBuffer, email, lang);
    if (!sent) {
      console.warn("[EMAIL] Booking confirmation NOT sent for PNR " + (booking.pnr || "N/A"));
    }
    return sent;
  } catch (err) {
    console.error("[EMAIL] Sending failed for PNR " + (booking.pnr || "N/A") + ":", err.message);
    return false;
  }
}

function buildQrPayload(booking, busDetails) {
  const firstPassenger = (booking.passengerDetails || [])[0];
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

/** "HH:MM" / "HH:MM AM" -> minutes from midnight (null when unparseable). */
function parseClock(timeStr) {
  if (!timeStr) return null;
  let str = String(timeStr).trim();
  if (!str) return null;
  let extra = 0;
  const ampm = str.match(/\s*(AM|PM)\s*$/i);
  if (ampm) {
    str = str.slice(0, ampm.index).trim();
    if (/pm/i.test(ampm[1])) extra = 12 * 60;
  }
  const parts = str.split(":");
  const h = parseInt(parts[0], 10);
  const m = parts.length > 1 ? parseInt(parts[1], 10) || 0 : 0;
  if (isNaN(h)) return null;
  return ((h % 24) * 60 + m + extra) % (24 * 60);
}

function minutesToHHMM(mins) {
  const m = ((mins % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function addDaysToDate(dateStr, days) {
  const d = new Date(`${String(dateStr).slice(0, 10)}T12:00:00+05:30`);
  if (isNaN(d.getTime())) return String(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Builds the SERVER-side journey details for a booked segment: exact stop
 * names/times come from the Route document (never from req.body), overnight
 * arrivals roll onto the next calendar day.
 */
function buildJourneyDetails(route, bus, fromSeq, toSeq, journeyDate) {
  const stops = route.stops || [];
  const fromStop = stops.find((s) => Number(s.sequence) === fromSeq);
  const toStop = stops.find((s) => Number(s.sequence) === toSeq);

  const depMinutes = fromStop ? parseClock(fromStop.departureTime) : parseClock(bus && bus.departureTime);
  const arrMinutes = toStop ? parseClock(toStop.arrivalTime) : null;

  let dayOffset = 0;
  let durationLabel = "";
  if (depMinutes != null && arrMinutes != null) {
    let span = arrMinutes - depMinutes;
    if (span <= 0) {
      span += 1440;
      dayOffset = 1;
    }
    const h = Math.floor(span / 60);
    const m = span % 60;
    durationLabel = h ? `${h}h ${m}m` : `${m}m`;
  }

  const depDate = String(journeyDate).slice(0, 10);
  return {
    departureDetails: {
      city: fromStop ? fromStop.stopName : "",
      time: depMinutes != null ? minutesToHHMM(depMinutes) : "",
      date: depDate,
    },
    arrivalDetails: {
      city: toStop ? toStop.stopName : "",
      time: arrMinutes != null ? minutesToHHMM(arrMinutes) : "",
      date: depMinutes != null && arrMinutes != null ? addDaysToDate(depDate, dayOffset) : depDate,
    },
    duration: durationLabel,
    dayOffset,
  };
}

function validatePassengerDetails(raw, maxCount) {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, error: "passengerDetails must be a non-empty array." };
  }
  if (raw.length > maxCount) {
    return { ok: false, error: "More passengers than selected seats." };
  }
  const cleaned = [];
  for (const p of raw) {
    const name = String(p?.name || "").trim().slice(0, 80);
    const age = parseInt(p?.age, 10);
    const gender = ["male", "female", "other"].includes(p?.gender) ? p.gender : "";
    if (name.length < 2) return { ok: false, error: "Each passenger needs a valid name." };
    if (!Number.isInteger(age) || age < 1 || age > 120) return { ok: false, error: "Each passenger needs a valid age." };
    cleaned.push({ name, age, gender });
  }
  return { ok: true, passengers: cleaned };
}

// ===========================================================================
// LOCK ON PROCEED — endpoints backing the new checkout flow
// ===========================================================================

/**
 * POST /booking/seats/lock   (requireAuth)
 * Body: { routeId, busId, date, seats, boardingStopSequence, droppingStopSequence, seatType? }
 *
 * Atomically places a 10-minute hold on the selected seats for the requested
 * segment and returns the SERVER-computed fare quote for exactly those seats.
 * The Angular app shows the countdown from expiresAt; nothing is charged yet.
 */
exports.lockSeats = async (req, res) => {
  const { routeId, busId, date, seats, boardingStopSequence, droppingStopSequence, seatType } = req.body || {};
  if (!routeId || !busId || !date) {
    return res.status(400).send({ error: tReq(req, "booking.orderFields") });
  }
  const cleanSeats = normalizeSeats(seats);
  if (!cleanSeats.length) {
    return res.status(400).send({ error: tReq(req, "booking.seatRequired") });
  }

  try {
    const [route, bus] = await Promise.all([
      Route.findById(routeId).lean().exec(),
      Bus.findById(busId).lean().exec(),
    ]);
    if (!route) return res.status(404).send({ error: "Route not found." });
    if (!bus) return res.status(404).send({ error: "Bus not found." });
    if (bus.isActive === false) {
      return res.status(409).send({ error: "This service is no longer available." });
    }

    const fromSeq = parseInt(boardingStopSequence, 10);
    const toSeq = parseInt(droppingStopSequence, 10);
    const validSegment =
      Number.isInteger(fromSeq) &&
      Number.isInteger(toSeq) &&
      fromSeq < toSeq &&
      (route.stops || []).some((s) => Number(s.sequence) === fromSeq) &&
      (route.stops || []).some((s) => Number(s.sequence) === toSeq);
    if (!validSegment) {
      return res.status(400).send({ error: "Invalid boarding/dropping stop selection." });
    }

    const result = await holdSeatsSegment({
      busId: String(busId),
      date: String(date),
      seats: cleanSeats,
      boardingSequence: fromSeq,
      droppingSequence: toSeq,
    });

    if (!result.success) {
      return res.status(409).send({
        error: tReq(req, "booking.errSeatsTaken"),
        conflictingSeats: result.conflictingSeats || [],
        soldSeats: await getSegmentSoldSeats(String(busId), String(date), fromSeq, toSeq, bus.totalSeats || 40),
      });
    }

    const quote = await computeAuthoritativeFare({
      routeId,
      busId,
      date,
      seats: cleanSeats,
      boardingStopSequence: fromSeq,
      droppingStopSequence: toSeq,
      seatType,
    });

    return res.send({
      success: true,
      holdId: result.holdId,
      expiresAt: result.expiresAt,
      holdTtlMs: HOLD_TTL_MS,
      fare: quote.fare,
      context: {
        routeId: String(routeId),
        busId: String(busId),
        date: String(date),
        seats: cleanSeats,
        boardingStopSequence: fromSeq,
        droppingStopSequence: toSeq,
      },
    });
  } catch (error) {
    console.error("lockSeats error:", error.message);
    res.status(500).send({ error: tReq(req, "booking.errValidate") });
  }
};

/**
 * POST /booking/seats/release   (requireAuth)
 * Body: { busId, date, holdId }
 *
 * Explicitly gives up a hold when the customer backs out or the drawer
 * closes. Holds also self-expire, so a missed call is never fatal.
 */
exports.releaseSeatLock = async (req, res) => {
  const { busId, date, holdId } = req.body || {};
  if (!busId || !date || !holdId) {
    return res.status(400).send({ error: "busId, date and holdId are required." });
  }
  try {
    await releaseHold(String(busId), String(date), String(holdId));
    res.send({ success: true });
  } catch (error) {
    console.error("releaseSeatLock error:", error.message);
    res.status(500).send({ error: "Could not release the seat hold." });
  }
};

// ===========================================================================
// BOOKING CREATION — the ONE authoritative path
//
// Requires BOTH:
//   1. paymentReference -> a VERIFIED, unexpired, unused PaymentAttempt
//      (Razorpay signature checked in controller/payment.js), and
//   2. holdId -> an ACTIVE seat hold whose rows match the attempt's recorded
//      booking context exactly.
//
// Everything written to the Booking document (fare, stop names, times, dates,
// distance) is derived SERVER-SIDE from Route/Bus/PaymentAttempt documents.
// There is no legacy free-booking path anymore.
// ===========================================================================
exports.addbooking = async (req, res) => {
  const { paymentReference, holdId } = req.body || {};
  if (!paymentReference || !holdId) {
    return res.status(400).send({
      error: "paymentReference and holdId are required.",
      reason: !paymentReference ? "PAYMENT_REQUIRED" : "HOLD_REQUIRED",
    });
  }

  const customerId = req.userId;

  try {
    // ---- 1. Payment attempt must be verified, alive, unused and ours. ----
    const attempt = await PaymentAttempt.findOne({ paymentReference }).exec();
    if (!attempt) {
      return res.status(400).send({ error: tReq(req, "booking.paymentNotVerified"), reason: "PAYMENT_NOT_FOUND" });
    }
    if (String(attempt.customerId) !== String(customerId)) {
      return res.status(403).send({ error: "This payment belongs to another account.", reason: "PAYMENT_OWNERSHIP" });
    }
    if (attempt.status === "used") {
      return res.status(409).send({ error: tReq(req, "booking.paymentUsed"), reason: "PAYMENT_USED" });
    }
    if (attempt.status === "expired" || (attempt.expiresAt && attempt.expiresAt.getTime() < Date.now())) {
      attempt.status = "expired";
      await attempt.save();
      return res.status(410).send({ error: tReq(req, "booking.paymentExpired"), reason: "PAYMENT_EXPIRED" });
    }
    if (attempt.status !== "verified") {
      return res.status(400).send({ error: tReq(req, "booking.paymentVerifyFailed"), reason: "PAYMENT_NOT_VERIFIED" });
    }

    const ctx = attempt.context || {};
    if (!ctx.routeId || !ctx.busId || !ctx.date || !(ctx.seats || []).length) {
      return res.status(400).send({ error: "Payment record is missing booking context.", reason: "CONTEXT_MISSING" });
    }
    if (String(attempt.holdId) !== String(holdId)) {
      return res.status(400).send({ error: "Seat hold does not match this payment.", reason: "HOLD_MISMATCH" });
    }

    const seats = ctx.seats.map(Number);
    const fromSeq = ctx.boardingStopSequence != null ? Number(ctx.boardingStopSequence) : null;
    const toSeq = ctx.droppingStopSequence != null ? Number(ctx.droppingStopSequence) : null;
    if (fromSeq == null || toSeq == null || !(fromSeq < toSeq)) {
      return res.status(400).send({ error: "Payment record is missing a valid segment.", reason: "SEGMENT_MISSING" });
    }

    // ---- 2. Hold must still be alive and cover exactly those seats. ----
    const holdCheck = await validateActiveHold({
      busId: ctx.busId,
      date: ctx.date,
      seats,
      boardingSequence: fromSeq,
      droppingSequence: toSeq,
      holdId,
    });
    if (!holdCheck.ok) {
      const status = holdCheck.reason === "HOLD_EXPIRED" ? 410 : 409;
      return res.status(status).send({
        error:
          holdCheck.reason === "HOLD_EXPIRED"
            ? tReq(req, "booking.holdExpired") || "Your seat selection expired. Please pick your seats again."
            : tReq(req, "booking.errSeatsTaken"),
        reason: holdCheck.reason,
      });
    }

    // ---- 3. Convert the hold to pending rows tied to this payment. ----
    const pendingKey = `pending:${paymentReference}`;
    const converted = await confirmHolds(ctx.busId, ctx.date, holdId, pendingKey);
    if (converted !== seats.length) {
      // Partial/failed conversion (expiry race with the sweeper): roll back
      // whatever was flipped so no seat stays blocked by a dead checkout.
      await releaseSegmentSeats(ctx.busId, ctx.date, pendingKey);
      return res.status(410).send({
        error: tReq(req, "booking.holdExpired") || "Your seat selection expired. Please pick your seats again.",
        reason: "HOLD_EXPIRED",
      });
    }

    // ---- 4. Authoritative data resolution (never trust req.body). ----
    let bookingDoc;
    try {
      const route = await Route.findById(ctx.routeId).lean().exec();
      const bus = await Bus.findById(ctx.busId).lean().exec();
      if (!route || !bus) throw new Error("ROUTE_OR_BUS_GONE");

      const fromStop = (route.stops || []).find((s) => Number(s.sequence) === fromSeq);
      const toStop = (route.stops || []).find((s) => Number(s.sequence) === toSeq);
      if (!fromStop || !toStop) throw new Error("STOPS_GONE");

      const segmentDistanceKm =
        fromStop.distanceFromOrigin != null && toStop.distanceFromOrigin != null
          ? Math.round((toStop.distanceFromOrigin - fromStop.distanceFromOrigin) * 100) / 100
          : calculateSegmentDistance(route.stops || [], fromSeq, toSeq);

      // Fare sanity: what we recompute now must roughly equal what the
      // gateway actually captured. Occupancy cannot change under a hold, so
      // only admin price edits could move this number.
      let quote;
      try {
        quote = await computeAuthoritativeFare({
          routeId: ctx.routeId,
          busId: ctx.busId,
          date: ctx.date,
          seats,
          boardingStopSequence: fromSeq,
          droppingStopSequence: toSeq,
          seatType: "regular",
        });
      } catch (fareErr) {
        quote = null;
      }
      if (quote && quote.fare) {
        const tolerance = Math.max(10, Math.round(attempt.amount * 0.02));
        if (Math.abs(quote.fare.totalForSeats - attempt.amount) > tolerance) {
          await releaseSegmentSeats(ctx.busId, ctx.date, pendingKey);
          console.error(
            `[RECONCILIATION_REQUIRED] payment=${paymentReference} charged=${attempt.amount} recomputed=${quote.fare.totalForSeats}`
          );
          return res.status(409).send({
            error:
              "Pricing changed while you were checking out. Your payment is safe and will be refunded — please contact support with reference " +
              paymentReference +
              ".",
            reason: "FARE_MISMATCH",
            expectedFare: quote.fare.totalForSeats,
          });
        }
      }

      // ---- 5. Build the booking document from server-side truth. ----
      const passengerCheck = validatePassengerDetails(req.body.passengerDetails, seats.length);
      if (!passengerCheck.ok) {
        await releaseSegmentSeats(ctx.busId, ctx.date, pendingKey);
        return res.status(400).send({ error: tReq(req, "booking.fieldsRequired") || passengerCheck.error });
      }

      const email = await resolveCustomerEmail(customerId);
      const busDetails = await resolveBusDetails(ctx.busId);
      const journey = buildJourneyDetails(route, bus, fromSeq, toSeq, ctx.date);
      const pnr = await uniquePnr();

      const snap = quote && quote.fare ? quote.fare : null;
      const fareSnapshot = {
        baseFare: snap ? snap.baseFare : attempt.amount,
        seatFare: snap ? snap.seatFare : 0,
        dynamicFare: snap ? snap.dynamicFare : 0,
        tax: snap ? snap.tax : 0,
        serviceFee: snap ? snap.serviceFee : 0,
        totalFare: attempt.amount,
        pricePerKm: route.fareConfig?.pricePerKm || 0,
        distance: segmentDistanceKm,
      };

      bookingDoc = await Booking.create({
        customerId,
        email: email || "",
        phoneNumber: String(req.body.phoneNumber || "").trim().slice(0, 20),
        passengerDetails: passengerCheck.passengers,
        seats,
        fare: attempt.amount,
        pnr,
        busId: String(ctx.busId),
        routeId: String(ctx.routeId),
        busDetails,
        paymentStatus: "verified",
        paymentReference,
        transactionId: attempt.transactionId || "",
        paymentMethod: attempt.method || "razorpay",
        paymentTime: attempt.updatedAt || attempt.createdAt || new Date(),
        status: "ticket_confirmed",
        holdId: String(holdId),
        boardingStopSequence: fromSeq,
        droppingStopSequence: toSeq,
        boardingStopName: fromStop.stopName,
        droppingStopName: toStop.stopName,
        segmentDistanceKm,
        journeyDate: ctx.date,
        departureDetails: journey.departureDetails,
        arrivalDetails: journey.arrivalDetails,
        duration: journey.duration,
        fareSnapshot,
        isBusinessTravel: !!req.body.isBusinessTravel,
        businessDetails: req.body.isBusinessTravel
          ? {
              gstNumber: String(req.body.businessDetails?.gstNumber || "").slice(0, 20),
              companyName: String(req.body.businessDetails?.companyName || "").slice(0, 120),
            }
          : undefined,
        isInsurance: !!req.body.isInsurance,
        isCovidDonated: !!req.body.isCovidDonated,
        timeline: [
          { status: "booked", at: new Date() },
          { status: "payment_verified", at: new Date() },
          { status: "ticket_confirmed", at: new Date() },
        ],
      });

      // ---- 6. Re-point seat rows from the pending key to the real _id. ----
      await repointRows(ctx.busId, ctx.date, pendingKey, String(bookingDoc._id));

      // ---- 7. Consume the payment attempt atomically. ----
      const consumed = await PaymentAttempt.updateOne(
        { _id: attempt._id, status: "verified" },
        { $set: { status: "used", bookingId: String(bookingDoc._id) } }
      ).exec();
      if (!consumed.modifiedCount) {
        // Lost an idempotency race — another request already used this
        // payment. Undo our booking entirely rather than double-sell.
        await Booking.deleteOne({ _id: bookingDoc._id }).exec();
        await releaseSegmentSeats(ctx.busId, ctx.date, String(bookingDoc._id));
        await releaseSegmentSeats(ctx.busId, ctx.date, pendingKey);
        return res.status(409).send({ error: tReq(req, "booking.paymentUsed"), reason: "PAYMENT_USED" });
      }

      bookingDoc.qrPayload = signQrPayload(buildQrPayload(bookingDoc, busDetails));
      await bookingDoc.save();

      try {
        broadcastSeatsBooked(ctx.busId, ctx.date, seats);
      } catch (broadcastError) {
        console.error("seat broadcast error:", broadcastError.message);
      }

      sendBookingTicketEmail(bookingDoc, busDetails, customerId, resolveLang(req)).catch(
        (err) => console.error("[EMAIL] ticket email pipeline error:", err.message)
      );

      notificationService.notifyBookingConfirmed(bookingDoc).catch((err) =>
        console.error("booking notification error:", err.message)
      );
      notificationService.notifyPaymentSuccessful(bookingDoc, attempt.amount).catch((err) =>
        console.error("payment notification error:", err.message)
      );

      console.log("Booking created:", bookingDoc.pnr);
      return res.send(bookingDoc);
    } catch (bookingError) {
      // Anything failing after the hold was converted must give the seats
      // straight back — a customer never keeps a lock for an uncreated trip.
      await releaseSegmentSeats(ctx.busId, ctx.date, pendingKey).catch(() => {});
      if (bookingError.message !== "ROUTE_OR_BUS_GONE" && bookingError.message !== "STOPS_GONE") {
        console.error("Error creating booking:", bookingError);
      }
      return res.status(500).send({ error: tReq(req, "booking.errCreate") });
    }
  } catch (error) {
    console.error("Error creating booking:", error);
    return res.status(500).send({ error: tReq(req, "booking.errCreate") });
  }
};

// ===========================================================================
// Pre-payment seat validation (public) — authoritative sold list + conflicts.
// ===========================================================================
exports.validateSeats = async (req, res) => {
  const { busId, date, boardingSequence, droppingSequence } = req.body || {};
  if (!busId || !date) {
    return res.status(400).send({ error: tReq(req, "booking.validateFields") });
  }
  try {
    const fromSeq = boardingSequence != null ? parseInt(boardingSequence, 10) : null;
    const toSeq = droppingSequence != null ? parseInt(droppingSequence, 10) : null;

    let soldSeats;
    if (fromSeq != null && toSeq != null && !isNaN(fromSeq) && !isNaN(toSeq)) {
      soldSeats = await getSegmentSoldSeats(String(busId), String(date), fromSeq, toSeq, 40);
    } else {
      soldSeats = await getSoldSeats(String(busId), String(date));
    }

    const requested = normalizeSeats(req.body.seats);
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
// Driver verification. Public on purpose — the conductor scanning the QR is
// not a logged-in customer. The QR payload is HMAC-signed.
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
      departure: booking.departureDetails?.time || "",
      arrival: booking.arrivalDetails?.time || "",
      boardingPoint: booking.boardingStopName || booking.departureDetails?.city || "",
      droppingPoint: booking.droppingStopName || booking.arrivalDetails?.city || "",
      seats: booking.seats || [],
      paymentStatus: booking.paymentStatus || "verified",
      bookingStatus: cancelled ? "cancelled" : booking.status,
    },
  });
};

// ===========================================================================
// CANCELLATION — policy-driven, identical math for customers and admins.
// ===========================================================================

/**
 * GET /booking/refund-quote/:id   (requireAuth + owner)
 *
 * What would this cancellation refund? Computed live against the
 * admin-configured CancellationPolicy — the UI displays this BEFORE the user
 * confirms, and the cancel endpoint recomputes it independently.
 */
exports.refundQuote = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id).lean().exec();
    if (!booking) return res.status(404).send({ error: tReq(req, "booking.notFound") });
    if (!isOwner(booking, req)) {
      return res.status(403).send({ error: tReq(req, "booking.ownBookingOnly") });
    }
    if (booking.status === "cancelled") {
      return res.send({
        success: false,
        alreadyCancelled: true,
        refundAmount: booking.refundAmount || 0,
        refundStatus: booking.refundStatus || "none",
      });
    }
    const quote = await computeRefundForBooking(booking);
    res.send({ success: true, alreadyCancelled: false, ...quote });
  } catch (error) {
    console.error("refundQuote error:", error.message);
    res.status(500).send({ error: tReq(req, "booking.errCancel") });
  }
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

    // Policy decides everything: window + percentage. No hardcoded numbers.
    const quote = await computeRefundForBooking(booking.toObject());
    if (!quote.allowed) {
      return res.status(409).send({
        error:
          quote.reason === "JOURNEY_ALREADY_STARTED"
            ? tReq(req, "booking.cancelWindowClosed") ||
              "This journey has already started — online cancellation is closed."
            : tReq(req, "booking.errCancel"),
        reason: quote.reason,
      });
    }

    const now = new Date();
    booking.status = "cancelled";
    booking.cancelledAt = now;
    booking.cancelledBy = "customer";
    booking.refundAmount = quote.refundAmount;
    booking.refundPercent = quote.refundPercent;
    booking.refundStatus = quote.refundAmount > 0 ? "initiated" : "not_applicable";
    booking.cancellationReason = String(req.body?.reason || "").slice(0, 200);
    booking.timeline = booking.timeline || [];
    booking.timeline.push({
      status: "cancelled",
      at: now,
      meta: {
        refundAmount: quote.refundAmount,
        refundPercent: quote.refundPercent,
        hoursBeforeDeparture: quote.hoursBeforeDeparture,
      },
    });
    await booking.save();

    const date = String(booking.departureDetails?.date || "");
    const busId = String(booking.busId);
    await releaseSegmentSeats(busId, date, String(booking._id)).catch((e) =>
      console.error("segment release error:", e.message)
    );
    await releaseSeats(busId, date, booking.seats || []).catch((e) =>
      console.error("flat release error:", e.message)
    );

    try {
      broadcastSeatsReleased(busId, date, booking.seats || []);
    } catch (broadcastError) {
      console.error("seat release broadcast error:", broadcastError.message);
    }

    notificationService.notifyBookingCancelled(booking).catch((err) =>
      console.error("cancellation notification error:", err.message)
    );
    notificationService.notifyTicketCancelled(booking).catch((err) =>
      console.error("ticket cancellation notification error:", err.message)
    );
    if (typeof notificationService.notifyRefundInitiated === "function" && quote.refundAmount > 0) {
      notificationService.notifyRefundInitiated(booking, quote.refundAmount).catch((err) =>
        console.error("refund notification error:", err.message)
      );
    }

    res.send(booking);
  } catch (error) {
    console.error("Error cancelling booking:", error);
    res.status(500).send({ error: tReq(req, "booking.errCancel") });
  }
};

// ---------------------------------------------------------------------------
// Segment-aware fare calculation (public preview).
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

    let occupancyPercent = 0;
    if (busId && date) {
      const soldSeats = await getSegmentSoldSeats(
        busId,
        date,
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
