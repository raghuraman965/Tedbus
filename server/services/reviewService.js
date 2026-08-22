// ---------------------------------------------------------------------------
// Review domain service (Task 6).
//
// Single source of truth for every review policy constant and for the
// eligibility / aggregation logic shared by all review endpoints. No magic
// numbers in controllers.
// ---------------------------------------------------------------------------

const Review = require("../models/review");
const Booking = require("../models/booking");
const Bus = require("../models/bus");

// ---- Configured limits -----------------------------------------------------
const REVIEW_LIMITS = {
  MIN_CHARS: 20,          // minimum review text length (anti low-effort)
  MAX_CHARS: 2000,        // hard backend maximum
  TITLE_MAX_CHARS: 120,
  MIN_RATING: 1,
  MAX_RATING: 5,
};

const EDIT_WINDOW_HOURS = 24;              // reviews editable only within 24h
const REPORT_AUTO_HIDE_THRESHOLD = 3;      // unique reports before auto-hide
const TRUSTED_REVIEWER_HELPFUL_THRESHOLD = 10; // helpful votes needed for badge

// Booking statuses that represent a confirmed (non-cancelled) ticket.
const CONFIRMED_BOOKING_STATUSES = ["upcoming", "ticket_confirmed", "payment_verified"];

// ---- Helpers ----------------------------------------------------------------

/** Strict integer rating validation. Rejects decimals, strings, out-of-range. */
function isValidRating(value) {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= REVIEW_LIMITS.MIN_RATING &&
    value <= REVIEW_LIMITS.MAX_RATING
  );
}

/** Parse a booking time value ("HH:MM" string or hour number) to [h, m]. */
function parseBookingTime(time) {
  if (time === undefined || time === null || time === "") return null;
  if (typeof time === "number" && Number.isFinite(time)) {
    return { h: Math.floor(time) % 24, m: Math.round((time % 1) * 60) };
  }
  const str = String(time).trim();
  if (/^\d{1,2}:\d{2}/.test(str)) {
    const [h, m] = str.split(":");
    return { h: parseInt(h, 10) % 24, m: parseInt(m, 10) || 0 };
  }
  const n = Number(str);
  if (Number.isFinite(n)) return { h: Math.floor(n) % 24, m: 0 };
  return null;
}

/** Parse "YYYY-MM-DD..." (also tolerates "YYYY-M-D") into a Date at midnight IST. */
function parseBookingDate(dateStr) {
  if (!dateStr) return null;
  const m = String(dateStr).match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return null;
  // Bookings are created in IST context across the app (+05:30).
  return new Date(`${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}T00:00:00+05:30`);
}

/** Full arrival Date for a booking, or null when it cannot be determined. */
function bookingArrivalDate(booking) {
  if (!booking) return null;
  const base = parseBookingDate(booking.arrivalDetails?.date || booking.departureDetails?.date);
  if (!base) return null;
  const t = parseBookingTime(booking.arrivalDetails?.time);
  if (!t) return base;
  const d = new Date(base.getTime());
  d.setUTCHours(t.h - 5, t.m - 30, 0, 0); // shift IST wall-clock to UTC instant
  return d;
}

/**
 * True when the booked journey has actually been completed.
 * - explicit DB status "completed", or
 * - confirmed + paid booking whose arrival datetime is in the past.
 */
function isJourneyCompleted(booking) {
  if (!booking) return false;
  if (booking.status === "completed") return true;
  if (booking.status === "cancelled") return false;
  const paid = (booking.paymentStatus || "verified") === "verified";
  if (!paid || !CONFIRMED_BOOKING_STATUSES.includes(booking.status)) return false;
  const arrival = bookingArrivalDate(booking);
  return !!arrival && arrival.getTime() < Date.now();
}

/**
 * Full eligibility check for posting a review of `routeId` using `bookingId`.
 * Returns { eligible, reason } where reason is a stable machine code the
 * frontend maps to an i18n key.
 */
async function checkReviewEligibility({ userId, routeId, busId, bookingId }) {
  if (!userId) return { eligible: false, reason: "auth_required" };

  const booking = await Booking.findOne({ _id: bookingId }).lean().exec();
  if (!booking) return { eligible: false, reason: "booking_not_found" };
  if (String(booking.customerId) !== String(userId)) {
    return { eligible: false, reason: "booking_not_owned" };
  }
  if ((booking.paymentStatus || "verified") !== "verified") {
    return { eligible: false, reason: "payment_not_verified" };
  }
  if (booking.status === "cancelled") return { eligible: false, reason: "booking_cancelled" };
  if (!isJourneyCompleted(booking)) return { eligible: false, reason: "journey_not_completed" };

  // The booking must belong to the reviewed route (via its bus → route ref).
  const bus = await Bus.findById(booking.busId).select("routes").lean().exec();
  if (!bus || !bus.routes) return { eligible: false, reason: "route_mismatch" };
  const bookingRouteId = String(bus.routes);
  if (routeId && bookingRouteId !== String(routeId)) {
    return { eligible: false, reason: "route_mismatch" };
  }
  if (busId && String(booking.busId) !== String(busId)) {
    return { eligible: false, reason: "route_mismatch" };
  }

  const existing = await Review.exists({ bookingId: booking._id }).exec();
  if (existing) return { eligible: false, reason: "already_reviewed" };

  return { eligible: true, reason: null, booking, bookingRouteId };
}

/**
 * Whether the given user's account may post reviews (verified & not suspended).
 */
function isAccountVerifiedForReviews(user) {
  return !!user && user.isVerified === true && user.isSuspended !== true;
}

/**
 * Aggregated rating stats over VISIBLE reviews only. Hidden/removed reviews
 * never contribute to the average or the count.
 */
async function getRouteRatingStats(routeId) {
  const match = { routeId: toObjectId(routeId), status: "visible" };
  const rows = await Review.aggregate([
    { $match: match },
    {
      $group: {
        _id: "$routeId",
        avgRating: { $avg: "$rating" },
        totalReviews: { $sum: 1 },
        ratings: { $push: "$rating" },
      },
    },
  ]).exec();
  return shapeStats(rows[0]);
}

async function getBusRatingStats(busId) {
  const match = { busId: toObjectId(busId), status: "visible" };
  const rows = await Review.aggregate([
    { $match: match },
    {
      $group: {
        _id: "$busId",
        avgRating: { $avg: "$rating" },
        totalReviews: { $sum: 1 },
        ratings: { $push: "$rating" },
      },
    },
  ]).exec();
  return shapeStats(rows[0]);
}

function shapeStats(row) {
  const breakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let avg = 0;
  let total = 0;
  if (row) {
    avg = row.avgRating || 0;
    total = row.totalReviews || 0;
    for (const r of row.ratings || []) {
      breakdown[r] = (breakdown[r] || 0) + 1;
    }
  }
  return {
    avgRating: total ? Math.round(avg * 100) / 100 : 0,
    totalReviews: total,
    ratingBreakdown: breakdown,
  };
}

/** Real-time stats for many buses in one query (search results). */
async function getBusRatingStatsMap(busIds) {
  const ids = (busIds || []).map(toObjectId).filter(Boolean);
  const map = {};
  if (!ids.length) return map;
  const rows = await Review.aggregate([
    { $match: { busId: { $in: ids }, status: "visible" } },
    { $group: { _id: "$busId", avgRating: { $avg: "$rating" }, totalReviews: { $sum: 1 } } },
  ]).exec();
  for (const row of rows) {
    map[String(row._id)] = {
      avgRating: Math.round((row.avgRating || 0) * 100) / 100,
      totalReviews: row.totalReviews || 0,
    };
  }
  return map;
}

/** Total helpful votes a user received across their visible reviews. */
async function getUserHelpfulScore(userId) {
  const rows = await Review.aggregate([
    { $match: { customerId: toObjectId(userId), status: "visible" } },
    { $project: { score: { $size: { $ifNull: ["$helpfulVotes", []] } } } },
    { $group: { _id: null, total: { $sum: "$score" } } },
  ]).exec();
  return rows.length ? rows[0].total : 0;
}

/** Trusted reviewer = accumulated helpful votes reach the configured threshold. */
async function isTrustedReviewer(userId) {
  const score = await getUserHelpfulScore(userId);
  return score >= TRUSTED_REVIEWER_HELPFUL_THRESHOLD;
}

function toObjectId(id) {
  try {
    return id ? new (require("mongoose").Types.ObjectId)(String(id)) : null;
  } catch (e) {
    return null;
  }
}

module.exports = {
  REVIEW_LIMITS,
  EDIT_WINDOW_HOURS,
  REPORT_AUTO_HIDE_THRESHOLD,
  TRUSTED_REVIEWER_HELPFUL_THRESHOLD,
  CONFIRMED_BOOKING_STATUSES,
  isValidRating,
  isJourneyCompleted,
  bookingArrivalDate,
  checkReviewEligibility,
  isAccountVerifiedForReviews,
  getRouteRatingStats,
  getBusRatingStats,
  getBusRatingStatsMap,
  getUserHelpfulScore,
  isTrustedReviewer,
};
