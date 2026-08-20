const SeatLock = require("../models/seatLock");
const Booking = require("../models/booking");

// ---------------------------------------------------------------------------
// Legacy flat-seat reservation (backward compat — used when no segment info)
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
// Segment-aware seat reservation.
//
// `segmentBookings` is an array of { seatNumber, boardingSequence, droppingSequence }.
// A seat is available for the requested segment if NO existing segmentBooking
// for the same seatNumber has an overlapping range.
//
// Overlap: newStart < existingEnd AND newEnd > existingStart
// ---------------------------------------------------------------------------
async function reserveSeatsSegment(busId, date, segmentBookings, attempt = 0) {
  try {
    const lock = await SeatLock.findOne({ busId, date }).lean().exec();
    const existing = (lock && lock.segmentBookings) || [];

    const conflicts = [];
    for (const req of segmentBookings) {
      const overlapping = existing.find(
        (e) =>
          e.seatNumber === req.seatNumber &&
          e.boardingSequence < req.droppingSequence &&
          e.droppingSequence > req.boardingSequence
      );
      if (overlapping) {
        conflicts.push(req.seatNumber);
      }
    }

    if (conflicts.length > 0) {
      return { success: false, conflictingSeats: [...new Set(conflicts)] };
    }

    // Atomic: push all segment bookings
    const seatNumbers = segmentBookings.map((s) => s.seatNumber);
    const updated = await SeatLock.findOneAndUpdate(
      {
        busId,
        date,
        "segmentBookings.seatNumber": { $nin: seatNumbers },
      },
      {
        $push: {
          segmentBookings: { $each: segmentBookings },
          bookedSeats: { $each: seatNumbers },
        },
        $setOnInsert: { busId, date },
      },
      { upsert: true, new: true }
    );

    if (updated) {
      return { success: true };
    }

    // Fallback: recheck after upsert race
    if (attempt < 2) {
      return reserveSeatsSegment(busId, date, segmentBookings, attempt + 1);
    }

    return { success: false, conflictingSeats: seatNumbers };
  } catch (err) {
    if (err && err.code === 11000 && attempt < 2) {
      return reserveSeatsSegment(busId, date, segmentBookings, attempt + 1);
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Check if specific seats are available for a segment (without locking).
// ---------------------------------------------------------------------------
function getSegmentAvailableSeats(lock, seats, boardingSequence, droppingSequence) {
  if (!lock || !lock.segmentBookings) return { available: seats, unavailable: [] };
  const available = [];
  const unavailable = [];
  for (const seatNo of seats) {
    const overlapping = lock.segmentBookings.find(
      (e) =>
        e.seatNumber === seatNo &&
        e.boardingSequence < droppingSequence &&
        e.droppingSequence > boardingSequence
    );
    if (overlapping) {
      unavailable.push(seatNo);
    } else {
      available.push(seatNo);
    }
  }
  return { available, unavailable };
}

// ---------------------------------------------------------------------------
// Get sold seats for a specific segment.
// Returns seats that are NOT available for the given boarding→dropping range.
// ---------------------------------------------------------------------------
async function getSegmentSoldSeats(busId, date, boardingSequence, droppingSequence, totalSeats) {
  const lock = await SeatLock.findOne({ busId, date }).lean().exec();
  const segmentBookings = (lock && lock.segmentBookings) || [];
  const allSeats = Array.from({ length: totalSeats || 40 }, (_, i) => i + 1);

  const soldSeats = [];
  for (const seatNo of allSeats) {
    const overlapping = segmentBookings.find(
      (e) =>
        e.seatNumber === seatNo &&
        e.boardingSequence < droppingSequence &&
        e.droppingSequence > boardingSequence
    );
    if (overlapping) {
      soldSeats.push(seatNo);
    }
  }

  // Also include legacy flat bookedSeats
  if (lock && lock.bookedSeats) {
    for (const seatNo of lock.bookedSeats) {
      if (!soldSeats.includes(seatNo)) {
        // Only add if not already tracked in segment bookings
        const hasSegment = segmentBookings.find((e) => e.seatNumber === seatNo);
        if (!hasSegment) {
          soldSeats.push(seatNo);
        }
      }
    }
  }

  return [...new Set(soldSeats)].sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// Release previously reserved seats (flat — for cancellation of legacy bookings).
// ---------------------------------------------------------------------------
async function releaseSeats(busId, date, seats) {
  await SeatLock.updateOne(
    { busId, date },
    { $pull: { bookedSeats: { $in: seats } } }
  );
}

// ---------------------------------------------------------------------------
// Release segment bookings (for cancellation of segment-aware bookings).
// ---------------------------------------------------------------------------
async function releaseSegmentSeats(busId, date, bookingId) {
  const lock = await SeatLock.findOne({ busId, date }).exec();
  if (!lock) return;

  const toRemove = lock.segmentBookings.filter(
    (sb) => String(sb.bookingId) === String(bookingId)
  );
  if (toRemove.length === 0) return;

  const seatNumbers = toRemove.map((sb) => sb.seatNumber);
  await SeatLock.updateOne(
    { busId, date },
    {
      $pull: {
        segmentBookings: { bookingId: bookingId },
        bookedSeats: { $in: seatNumbers },
      },
    }
  );
}

// ---------------------------------------------------------------------------
// Source of truth for what a viewer should see as SOLD on (busId, date).
// ---------------------------------------------------------------------------
async function getSoldSeats(busId, date) {
  const [lock, bookings] = await Promise.all([
    SeatLock.findOne({ busId, date }).lean().exec(),
    Booking.find({ busId, "departureDetails.date": date, status: { $ne: "cancelled" } })
      .select("seats")
      .lean()
      .exec(),
  ]);

  const sold = new Set((lock && lock.bookedSeats) || []);
  bookings.forEach((b) => {
    (b.seats || []).forEach((seat) => sold.add(Number(seat)));
  });
  return Array.from(sold).sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// Validate multiple seats for availability (pre-payment check).
// ---------------------------------------------------------------------------
async function validateSeatsAvailability(busId, date, seats, boardingSequence, droppingSequence) {
  if (boardingSequence != null && droppingSequence != null) {
    const soldSeats = await getSegmentSoldSeats(busId, date, boardingSequence, droppingSequence, 40);
    const conflicts = seats.filter((s) => soldSeats.includes(s));
    return { success: conflicts.length === 0, soldSeats, conflicts };
  }
  const soldSeats = await getSoldSeats(busId, date);
  const conflicts = seats.filter((s) => soldSeats.includes(s));
  return { success: conflicts.length === 0, soldSeats, conflicts };
}

module.exports = {
  reserveSeatsAtomically,
  reserveSeatsSegment,
  getSegmentAvailableSeats,
  getSegmentSoldSeats,
  releaseSeats,
  releaseSegmentSeats,
  getSoldSeats,
  validateSeatsAvailability,
};
