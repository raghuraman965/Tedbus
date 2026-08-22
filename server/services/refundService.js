// ---------------------------------------------------------------------------
// Refund engine — the SINGLE place cancellation refunds are computed.
//
// Both the customer cancel endpoint and the admin cancel endpoint must call
// computeRefundForBooking(); no percentage is ever hardcoded in controllers
// and no amount is ever trusted from the client.
//
// Policy model (admin-editable): see models/cancellationPolicy.js.
// ---------------------------------------------------------------------------

const CancellationPolicy = require("../models/cancellationPolicy");
const Route = require("../models/route");
const Bus = require("../models/bus");

/** "HH:MM" / "HH:MM AM" -> minutes from midnight (null when unparseable). */
function timeToMinutes(timeStr) {
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

/**
 * Departure instant of THIS booking: journeyDate + the boarding stop's own
 * scheduled departure time (falls back to bus.departureTime).
 */
async function resolveDepartureInstant(booking) {
  const dateStr =
    booking.departureDetails?.date || booking.journeyDate || "";
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}/.test(dateStr)) return null;

  let minutes = null;
  if (booking.boardingStopSequence != null) {
    try {
      const route = await Route.findById(booking.routeId).select("stops").lean().exec();
      const stop = (route && route.stops || []).find(
        (s) => s.sequence === Number(booking.boardingStopSequence)
      );
      if (stop) minutes = timeToMinutes(stop.departureTime);
    } catch (e) {
      // fall through to bus departure time
    }
  }
  if (minutes == null) {
    try {
      const bus = await Bus.findById(booking.busId).select("departureTime").lean().exec();
      minutes = timeToMinutes(bus && bus.departureTime);
    } catch (e) {
      minutes = null;
    }
  }
  if (minutes == null) {
    return new Date(`${dateStr.slice(0, 10)}T00:00:00+05:30`);
  }
  const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
  const mm = String(minutes % 60).padStart(2, "0");
  return new Date(`${dateStr.slice(0, 10)}T${hh}:${mm}:00+05:30`);
}

function pickSlab(policy, hoursBefore) {
  const slabs = [...(policy.refundSlabs || [])].sort(
    (a, b) => b.minHoursBeforeDeparture - a.minHoursBeforeDeparture
  );
  for (const slab of slabs) {
    if (hoursBefore >= slab.minHoursBeforeDeparture) return slab;
  }
  return slabs.length ? slabs[slabs.length - 1] : { minHoursBeforeDeparture: 0, refundPercent: 0 };
}

/**
 * Compute everything the UI and both cancel paths need.
 *
 * @returns {{
 *   allowed: boolean, reason?: string,
 *   departureInstant: Date|null,
 *   hoursBeforeDeparture: number,
 *   refundPercent: number,
 *   refundAmount: number,
 *   nonRefundableAmount: number,
 *   paidAmount: number,
 *   breakdown: object,
 * }}
 */
async function computeRefundForBooking(booking, opts = {}) {
  const policy = opts.policy || (await CancellationPolicy.getGlobal());
  const departureInstant = await resolveDepartureInstant(booking);
  const now = new Date();

  const hoursBefore = departureInstant
    ? Math.round(((departureInstant.getTime() - now.getTime()) / 36e5) * 100) / 100
    : null;

  if (hoursBefore != null && hoursBefore < 0 && !policy.allowCancellationAfterDeparture) {
    return {
      allowed: false,
      reason: "JOURNEY_ALREADY_STARTED",
      departureInstant,
      hoursBeforeDeparture: hoursBefore,
      refundPercent: 0,
      refundAmount: 0,
      nonRefundableAmount: booking.fare || 0,
      paidAmount: booking.fare || 0,
      breakdown: {},
    };
  }

  const slab = pickSlab(policy, hoursBefore == null ? Infinity : Math.max(hoursBefore, 0));
  const seatCount = Math.max((booking.seats || []).length, 1);

  const snap = booking.fareSnapshot || {};
  const hasSnapshot =
    snap.baseFare != null &&
    (snap.baseFare > 0 ||
      snap.tax > 0 ||
      snap.serviceFee > 0);

  // Taxable components actually paid (fallback: treat whole fare as taxable
  // when a legacy booking carries no snapshot).
  let totalTaxable;
  let totalTax;
  let totalServiceFee;
  if (hasSnapshot) {
    const perSeatTaxable = (snap.baseFare || 0) + (snap.seatFare || 0) + (snap.dynamicFare || 0);
    totalTaxable = perSeatTaxable * seatCount;
    totalTax = (snap.tax || 0) * seatCount;
    totalServiceFee = (snap.serviceFee || 0) * seatCount;
  } else {
    totalTaxable = booking.fare || 0;
    totalTax = 0;
    totalServiceFee = 0;
  }

  const paidAmount = booking.fare || totalTaxable + totalTax + totalServiceFee;

  const refundedTaxable = Math.round(totalTaxable * (slab.refundPercent / 100));
  const refundedTax = policy.taxRefundable
    ? Math.round(totalTax * (slab.refundPercent / 100))
    : 0;
  const refundedServiceFee = policy.serviceFeeRefundable ? totalServiceFee : 0;

  const refundAmount = Math.min(
    paidAmount,
    refundedTaxable + refundedTax + refundedServiceFee
  );
  const nonRefundableAmount = Math.max(paidAmount - refundAmount, 0);

  return {
    allowed: true,
    reason: null,
    departureInstant,
    hoursBeforeDeparture: hoursBefore,
    refundPercent: slab.refundPercent,
    refundAmount,
    nonRefundableAmount,
    paidAmount,
    breakdown: {
      totalTaxable,
      totalTax,
      totalServiceFee,
      refundedTaxable,
      refundedTax,
      refundedServiceFee,
      serviceFeeRefundable: !!policy.serviceFeeRefundable,
      taxRefundable: !!policy.taxRefundable,
      slabLabel: slab.label || "",
      seatCount,
    },
  };
}

module.exports = {
  computeRefundForBooking,
  resolveDepartureInstant,
};
