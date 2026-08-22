const crypto = require("crypto");
const SeatLock = require("../models/seatLock");
const Booking = require("../models/booking");

// ---------------------------------------------------------------------------
// Segment-based seat inventory.
//
// One SeatLock document per (busId, date). Every occupied seat/segment lives
// in `segmentBookings` rows of the shape:
//
//   { seatNumber, boardingSequence, droppingSequence, bookingId, lockedAt,
//     expiresAt }
//
// Two row kinds share that array:
//   - CONFIRMED rows: bookingId = real booking id, expiresAt = null.
//     They exist only after payment verification + booking confirmation.
//   - HOLD rows:      bookingId = "hold:<holdId>", expiresAt = timestamp.
//     Temporary locks created on "Proceed to Booking"; they expire
//     automatically when payment is abandoned (default 10 minutes).
//
// A row BLOCKS a requested segment iff its range overlaps AND it is still
// active (expiresAt == null  OR  expiresAt > now). Overlap uses STRICT
// inequalities so touching segments are adjacent, not conflicting:
//     existing [1..4] + request [4..7]  -> ALLOWED
//     existing [1..5] + request [4..7]  -> CONFLICT
//
// All writes go through ONE atomic findOneAndUpdate guarded by a
// `$not/$elemMatch` overlap predicate, so two customers racing for the same
// seat/segment can never both win — MongoDB serializes the updates on the
// uniquely-indexed (busId, date) document.
// ---------------------------------------------------------------------------

const HOLD_TTL_MS = 10 * 60 * 1000; // 10-minute temporary seat lock

function newHoldId() {
  return crypto.randomBytes(12).toString("hex");
}

/** Overlap + liveness predicate applied per segmentBookings element. */
function blockingElemFilter(seatNumbers, fromSeq, toSeq, now) {
  return {
    seatNumber: { $in: seatNumbers },
    boardingSequence: { $lt: toSeq },
    droppingSequence: { $gt: fromSeq },
    $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
  };
}

/** True when an existing row conflicts with (seatNo, fromSeq→toSeq) now. */
function rowBlocks(existingRow, seatNo, fromSeq, toSeq, now) {
  const notExpired =
    existingRow.expiresAt == null ||
    new Date(existingRow.expiresAt).getTime() > now.getTime();
  return (
    Number(existingRow.seatNumber) === Number(seatNo) &&
    existingRow.boardingSequence < toSeq &&
    existingRow.droppingSequence > fromSeq &&
    notExpired
  );
}

function findConflicts(segmentRows, segmentBookings, now) {
  const conflicts = [];
  for (const req of segmentRows) {
    const hit = (segmentBookings || []).find((row) =>
      rowBlocks(row, req.seatNumber, req.boardingSequence, req.droppingSequence, now)
    );
    if (hit) conflicts.push(req.seatNumber);
  }
  return [...new Set(conflicts)].sort((a, b) => a - b);
}

async function loadLock(busId, date) {
  return SeatLock.findOne({ busId: String(busId), date: String(date) }).lean().exec();
}

// ---------------------------------------------------------------------------
// Legacy flat-seat reservation (kept for pre-segment data paths).
// ---------------------------------------------------------------------------
async function reserveSeatsAtomically(busId, date, seats, attempt = 0) {
  try {
    const updated = await SeatLock.findOneAndUpdate(
      { busId, date, bookedSeats: { $nin: seats } },
      {
        $push: { bookedSeats: { $each: seats } },
        $setOnInsert: { busId, date },
      },
      { upsert: true, new: true }
    );

    if (updated) {
      return { success: true };
    }

    const existing = await SeatLock.findOne({ busId, date }).lean().exec();
    const conflictingSeats = existing
      ? seats.filter((seat) => existing.bookedSeats.includes(seat))
      : [];

    if (conflictingSeats.length > 0) {
      return { success: false, conflictingSeats };
    }

    if (attempt < 2) {
      return reserveSeatsAtomically(busId, date, seats, attempt + 1);
    }
    return { success: false, conflictingSeats: seats };
  } catch (err) {
    if (err && err.code === 11000) {
      const existing = await SeatLock.findOne({ busId, date }).lean().exec();
      const conflictingSeats = existing
        ? seats.filter((seat) => existing.bookedSeats.includes(seat))
        : [];

      if (conflictingSeats.length > 0) {
        return { success: false, conflictingSeats };
      }

      if (attempt < 2) {
        return reserveSeatsAtomically(busId, date, seats, attempt + 1);
      }
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// HOLD: temporarily lock seats for one customer's checkout window.
// Atomically pushes hold rows ONLY if no active row overlaps any requested
// seat/segment. Returns the holdId + expiry so payment and booking creation
// can reference exactly this hold.
// ---------------------------------------------------------------------------
async function holdSeatsSegment({ busId, date, seats, boardingSequence, droppingSequence }) {
  const fromSeq = parseInt(boardingSequence, 10);
  const toSeq = parseInt(droppingSequence, 10);
  if (!Number.isInteger(fromSeq) || !Number.isInteger(toSeq) || fromSeq >= toSeq) {
    return { success: false, error: "INVALID_SEGMENT" };
  }
  const cleanSeats = (seats || []).map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (!cleanSeats.length) {
    return { success: false, error: "NO_SEATS" };
  }

  const now = new Date();
  const holdId = newHoldId();
  const expiresAt = new Date(now.getTime() + HOLD_TTL_MS);

  const segmentRows = cleanSeats.map((seatNumber) => ({
    seatNumber,
    boardingSequence: fromSeq,
    droppingSequence: toSeq,
    bookingId: `hold:${holdId}`,
    lockedAt: now,
    expiresAt,
  }));

  try {
    const updated = await SeatLock.findOneAndUpdate(
      {
        busId: String(busId),
        date: String(date),
        segmentBookings: { $not: { $elemMatch: blockingElemFilter(cleanSeats, fromSeq, toSeq, now) } },
      },
      {
        $push: { segmentBookings: { $each: segmentRows } },
        $setOnInsert: { busId: String(busId), date: String(date), bookedSeats: [] },
      },
      { upsert: true, new: true }
    );

    if (updated) {
      return { success: true, holdId, expiresAt, seats: cleanSeats };
    }
  } catch (err) {
    if (err.code !== 11000) throw err;
  }

  // Guard failed or duplicate-key race — report the precise conflicts.
  const lock = await loadLock(busId, date);
  const conflictingSeats = lock
    ? findConflicts(segmentRows, lock.segmentBookings, now)
    : cleanSeats;
  return { success: false, conflictingSeats };
}

// ---------------------------------------------------------------------------
// CONFIRM (direct): write confirmed segment rows. Used only by flows that do
// NOT go through a hold (none in the current flow — kept for tooling).
// ---------------------------------------------------------------------------
async function reserveSeatsSegment(busId, date, segmentBookings) {
  const clean = (segmentBookings || [])
    .map((s) => ({
      seatNumber: Number(s.seatNumber),
      boardingSequence: parseInt(s.boardingSequence, 10),
      droppingSequence: parseInt(s.droppingSequence, 10),
      bookingId: s.bookingId || "",
      lockedAt: s.lockedAt ? new Date(s.lockedAt) : new Date(),
      expiresAt: null,
    }))
    .filter(
      (s) =>
        Number.isInteger(s.seatNumber) &&
        s.seatNumber > 0 &&
        Number.isInteger(s.boardingSequence) &&
        Number.isInteger(s.droppingSequence) &&
        s.boardingSequence < s.droppingSequence
    );
  if (!clean.length) return { success: false, conflictingSeats: [] };

  const seatNumbers = clean.map((s) => s.seatNumber);
  const minFrom = Math.min(...clean.map((s) => s.boardingSequence));
  const maxTo = Math.max(...clean.map((s) => s.droppingSequence));
  const now = new Date();

  try {
    const updated = await SeatLock.findOneAndUpdate(
      {
        busId: String(busId),
        date: String(date),
        segmentBookings: { $not: { $elemMatch: blockingElemFilter(seatNumbers, minFrom, maxTo, now) } },
      },
      {
        $push: { segmentBookings: { $each: clean } },
        $setOnInsert: { busId: String(busId), date: String(date), bookedSeats: [] },
      },
      { upsert: true, new: true }
    );

    if (updated) return { success: true };
  } catch (err) {
    if (err.code !== 11000) throw err;
  }

  const lock = await loadLock(busId, date);
  const conflictingSeats = lock ? findConflicts(clean, lock.segmentBookings, now) : seatNumbers;
  return { success: false, conflictingSeats };
}

// ---------------------------------------------------------------------------
// CONVERT HOLD -> CONFIRMED. Flips every hold row created for `holdId` into a
// permanent confirmed row tied to the real booking id. Returns how many rows
// were converted (0 means the hold had already expired/been released).
// ---------------------------------------------------------------------------
async function confirmHolds(busId, date, holdId, bookingId) {
  const result = await SeatLock.updateOne(
    { busId: String(busId), date: String(date) },
    {
      $set: {
        "segmentBookings.$[row].bookingId": String(bookingId),
        "segmentBookings.$[row].expiresAt": null,
        "segmentBookings.$[row].lockedAt": new Date(),
      },
    },
    {
      arrayFilters: [{ "row.bookingId": `hold:${String(holdId)}` }],
    }
  ).exec();
  return result.modifiedCount || result.nModified || 0;
}

/** Re-points rows labelled `fromBookingId` (e.g. pending:<ref>) to the real
 *  booking id once the Booking document exists. */
async function repointRows(busId, date, fromBookingId, toBookingId) {
  const result = await SeatLock.updateOne(
    { busId: String(busId), date: String(date), "segmentBookings.bookingId": String(fromBookingId) },
    { $set: { "segmentBookings.$[row].bookingId": String(toBookingId) } },
    { arrayFilters: [{ "row.bookingId": String(fromBookingId) }] }
  ).exec();
  return result.modifiedCount || result.nModified || 0;
}

// ---------------------------------------------------------------------------
// VALIDATE ACTIVE HOLD — shared by the payment controller (before opening a
// gateway order) and the booking controller (before confirming a booking).
// Returns { ok, reason? } or { ok:true, hold:{...} } with the canonical hold
// facts so callers never need to trust client-supplied seat/segment data.
// ---------------------------------------------------------------------------
async function validateActiveHold({
  busId,
  date,
  seats,
  boardingSequence,
  droppingSequence,
  holdId,
}) {
  if (!holdId) return { ok: false, reason: "HOLD_REQUIRED" };
  const fromSeq = parseInt(boardingSequence, 10);
  const toSeq = parseInt(droppingSequence, 10);
  if (!Number.isInteger(fromSeq) || !Number.isInteger(toSeq) || fromSeq >= toSeq) {
    return { ok: false, reason: "INVALID_SEGMENT" };
  }

  const lock = await loadLock(busId, date);
  if (!lock) return { ok: false, reason: "HOLD_NOT_FOUND" };

  const now = new Date();
  const prefix = `hold:${String(holdId)}`;
  const want = new Set((seats || []).map(Number));
  const heldSeats = [];
  let segment = null;
  let expiresAt = null;
  let sawExpired = false;

  for (const row of lock.segmentBookings || []) {
    if (row.bookingId !== prefix) continue;
    if (row.expiresAt && new Date(row.expiresAt).getTime() <= now.getTime()) {
      sawExpired = true;
      continue;
    }
    if (
      row.boardingSequence !== fromSeq ||
      row.droppingSequence !== toSeq
    ) {
      return { ok: false, reason: "HOLD_SEGMENT_MISMATCH" };
    }
    heldSeats.push(Number(row.seatNumber));
    segment = { boardingSequence: row.boardingSequence, droppingSequence: row.droppingSequence };
    expiresAt = row.expiresAt || null;
  }

  if (!heldSeats.length) {
    return { ok: false, reason: sawExpired ? "HOLD_EXPIRED" : "HOLD_NOT_FOUND" };
  }

  // The hold must cover EXACTLY the requested seats — no more, no fewer.
  const heldSet = new Set(heldSeats);
  if (heldSet.size !== heldSeats.length) return { ok: false, reason: "HOLD_CORRUPT" };
  if (heldSeats.length !== want.size || [...want].some((s) => !heldSet.has(s))) {
    return { ok: false, reason: "HOLD_SEAT_MISMATCH" };
  }

  return {
    ok: true,
    hold: {
      holdId: String(holdId),
      busId: String(busId),
      date: String(date),
      seats: heldSeats.sort((a, b) => a - b),
      ...segment,
      expiresAt,
    },
  };
}

// ---------------------------------------------------------------------------
// RELEASE helpers.
// ---------------------------------------------------------------------------
async function releaseSeats(busId, date, seats) {
  await SeatLock.updateOne(
    { busId: String(busId), date: String(date) },
    { $pull: { bookedSeats: { $in: (seats || []).map(Number) } } }
  ).exec();
}

async function releaseSegmentSeats(busId, date, bookingId) {
  const key = String(bookingId);
  const variants = new Set([key]);
  if (!key.startsWith("hold:")) variants.add(`hold:${key}`);
  if (!key.startsWith("pending:")) variants.add(`pending:${key}`);
  await SeatLock.updateOne(
    { busId: String(busId), date: String(date) },
    {
      $pull: {
        segmentBookings: {
          bookingId: { $in: Array.from(variants) },
        },
      },
    }
  ).exec();

  // The pre-rebuild implementation mirrored every segment row into the flat
  // `bookedSeats` list. Rebuild that mirror from authoritative state so a
  // cancelled seat becomes free on EVERY segment while genuinely flat
  // (full-journey) bookings keep blocking theirs.
  const lock = await SeatLock.findOne({ busId: String(busId), date: String(date) }).exec();
  if (!lock) return;

  const now = new Date();
  const mirrored = new Set();
  (lock.segmentBookings || []).forEach((row) => {
    const active =
      row.expiresAt == null || new Date(row.expiresAt).getTime() > now.getTime();
    if (active) mirrored.add(Number(row.seatNumber));
  });

  const flatBookings = await Booking.find({
    busId: String(busId),
    "departureDetails.date": String(date),
    status: { $ne: "cancelled" },
    $or: [
      { boardingStopSequence: null },
      { droppingStopSequence: null },
    ],
  })
    .select("seats")
    .lean()
    .exec();
  flatBookings.forEach((b) => (b.seats || []).forEach((seat) => mirrored.add(Number(seat))));

  const next = Array.from(mirrored).sort((a, b) => a - b);
  if (JSON.stringify(next) !== JSON.stringify([...(lock.bookedSeats || [])].sort((a, b) => a - b))) {
    lock.bookedSeats = next;
    await lock.save();
  }
}

async function releaseHold(busId, date, holdId) {
  await SeatLock.updateOne(
    { busId: String(busId), date: String(date) },
    { $pull: { segmentBookings: { bookingId: `hold:${String(holdId)}` } } }
  ).exec();
}

/** Removes every expired hold row across all buses/dates. */
async function sweepExpiredHolds() {
  const cutoff = new Date();
  const result = await SeatLock.updateMany(
    {},
    { $pull: { segmentBookings: { expiresAt: { $ne: null, $lt: cutoff } } } }
  ).exec();
  return (result.modifiedCount || result.nModified || 0);
}

// ---------------------------------------------------------------------------
// READ models — what each viewer should consider SOLD right now.
// ---------------------------------------------------------------------------

/** Seats sold for the exact segment fromSeq→toSeq (flat bookings block all). */
async function getSegmentSoldSeats(busId, date, boardingSequence, droppingSequence, totalSeats) {
  const now = new Date();
  const lock = await loadLock(busId, date);
  const segmentBookings = (lock && lock.segmentBookings) || [];
  const allSeats = Array.from({ length: totalSeats || 40 }, (_, i) => i + 1);

  const sold = [];
  for (const seatNo of allSeats) {
    const blocked =
      // legacy flat bookings occupy the whole journey
      ((lock && lock.bookedSeats) || []).some((s) => Number(s) === Number(seatNo)) ||
      segmentBookings.some((row) => rowBlocks(row, seatNo, boardingSequence, droppingSequence, now));
    if (blocked) sold.push(seatNo);
  }
  return sold.sort((a, b) => a - b);
}

/** Flat (whole-journey) view: any active segment row marks the seat taken. */
async function getSoldSeats(busId, date) {
  const now = new Date();
  const [lock] = await Promise.all([loadLock(busId, date)]);
  const sold = new Set(((lock && lock.bookedSeats) || []).map(Number));
  ((lock && lock.segmentBookings) || []).forEach((row) => {
    const active = row.expiresAt == null || new Date(row.expiresAt).getTime() > now.getTime();
    if (active) sold.add(Number(row.seatNumber));
  });

  // Confirmed-but-unmirrored bookings (defence in depth for legacy docs).
  const bookings = await Booking.find({
    busId: String(busId),
    "departureDetails.date": String(date),
    status: { $nin: ["cancelled"] },
  })
    .select("seats")
    .lean()
    .exec();
  bookings.forEach((b) => (b.seats || []).forEach((seat) => sold.add(Number(seat))));

  return Array.from(sold).sort((a, b) => a - b);
}

/** Non-mutating check used before charging the customer. */
async function validateSeatsAvailability(busId, date, seats, boardingSequence, droppingSequence) {
  const requested = (seats || []).map(Number).filter((n) => Number.isInteger(n) && n > 0);
  let soldSeats;
  if (
    boardingSequence != null &&
    droppingSequence != null &&
    !isNaN(parseInt(boardingSequence, 10)) &&
    !isNaN(parseInt(droppingSequence, 10))
  ) {
    soldSeats = await getSegmentSoldSeats(
      busId,
      date,
      parseInt(boardingSequence, 10),
      parseInt(droppingSequence, 10),
      40
    );
  } else {
    soldSeats = await getSoldSeats(busId, date);
  }
  const conflicts = requested.filter((s) => soldSeats.includes(s));
  return { success: conflicts.length === 0, soldSeats, conflicts };
}

module.exports = {
  HOLD_TTL_MS,
  holdSeatsSegment,
  confirmHolds,
  repointRows,
  validateActiveHold,
  releaseHold,
  releaseSeats,
  releaseSegmentSeats,
  sweepExpiredHolds,
  reserveSeatsAtomically,
  reserveSeatsSegment,
  getSegmentSoldSeats,
  getSoldSeats,
  validateSeatsAvailability,
};
