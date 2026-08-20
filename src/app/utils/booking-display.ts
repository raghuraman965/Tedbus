// Shared display helpers for bookings/tickets. Keeps status logic, badge
// colours and timeline steps in ONE place so the My Trips cards, ticket page,
// confirmation page and driver verification all stay consistent.

import { formatClockTime } from './time-utils';

export interface BadgeInfo {
  key: string;      // i18n key
  cls: string;      // css class on the badge
}

const BOOKING_STATUS: Record<string, BadgeInfo> = {
  pending_payment: { key: 'trips.statusPending', cls: 'badge--pending' },
  payment_verified: { key: 'trips.statusVerified', cls: 'badge--verified' },
  ticket_confirmed: { key: 'trips.statusConfirmed', cls: 'badge--confirmed' },
  upcoming: { key: 'trips.statusConfirmed', cls: 'badge--confirmed' },
  cancelled: { key: 'trips.statusCancelled', cls: 'badge--cancelled' },
  completed: { key: 'trips.statusCompleted', cls: 'badge--completed' },
  expired: { key: 'trips.statusExpired', cls: 'badge--expired' },
};

const PAYMENT_STATUS: Record<string, BadgeInfo> = {
  verified: { key: 'trips.paymentPaid', cls: 'badge--paid' },
  pending: { key: 'trips.paymentPending', cls: 'badge--pending' },
  failed: { key: 'trips.paymentFailed', cls: 'badge--cancelled' },
  refunded: { key: 'trips.paymentRefunded', cls: 'badge--completed' },
};

const CONFIRMED = ['upcoming', 'ticket_confirmed', 'payment_verified'];
const ACTIVE_STATUSES = ['upcoming', 'ticket_confirmed', 'payment_verified', 'pending_payment'];

/**
 * Determines if a booking's journey has already ended based on the real
 * journey date and time from the booking record.
 *
 * Fallback logic:
 *  1. Uses arrivalDetails.date + arrivalDetails.time (arrival hour as integer)
 *  2. If arrival date unavailable, uses departureDetails.date + departureDetails.time
 *  3. If no time available, uses just the date (end of day, 23:59)
 *  4. If no date at all, returns false (cannot determine expiry)
 *
 * Timezone: Uses the browser's local timezone (same timezone the user
 * booked in, which is consistent for Indian bus travel).
 */
export function isBookingExpired(booking: any): boolean {
  if (!booking) return false;

  // Already completed or cancelled bookings are handled by their own status
  const s = booking?.status;
  if (s === 'cancelled' || s === 'completed' || s === 'expired') return false;

  const now = new Date();

  // Try arrival details first (journey truly ends on arrival)
  const arrDate = booking?.arrivalDetails?.date || booking?.departureDetails?.date;
  const arrTime = booking?.arrivalDetails?.time ?? booking?.departureDetails?.time;

  if (!arrDate) return false;

  // Parse the date string (e.g. "2026-8-5" or "2026-08-05")
  const dateMatch = String(arrDate).match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!dateMatch) return false;

  const [, y, mo, day] = dateMatch;
  let hour = 23;
  let minute = 59;

  if (arrTime !== undefined && arrTime !== null && arrTime !== '') {
    // time can be an integer like 14 (meaning 14:00) or a string like "14:30"
    const timeStr = String(arrTime);
    const parts = timeStr.split(':');
    hour = parseInt(parts[0], 10) || 23;
    minute = parts.length > 1 ? (parseInt(parts[1], 10) || 0) : 0;
  }

  const journeyEnd = new Date(
    Number(y), Number(mo) - 1, Number(day),
    hour, minute, 59, 999
  );

  return now > journeyEnd;
}

/** Returns the effective trip status string for display, accounting for expiry. */
export function effectiveTripStatus(booking: any): string {
  if (booking?.status === 'cancelled') return 'cancelled';
  if (booking?.status === 'completed') return 'completed';
  if (isBookingExpired(booking)) return 'expired';
  return booking?.status || 'ticket_confirmed';
}

/** Badge (label + colour class) for the booking status. Legacy `upcoming
 *  bookings render as "Ticket Confirmed". */
export function bookingStatusInfo(booking: any): BadgeInfo {
  const effective = effectiveTripStatus(booking);
  return BOOKING_STATUS[effective] || BOOKING_STATUS['ticket_confirmed'];
}

/** Badge for the payment status. Legacy bookings without a paymentStatus are
 *  treated as paid (they were created after "payment" in the old flow). */
export function paymentStatusInfo(booking: any): BadgeInfo {
  const p = booking?.paymentStatus || 'verified';
  return PAYMENT_STATUS[p] || PAYMENT_STATUS['verified'];
}

/** Legacy bookings (pre-PNR) fall back to the object-id tail so old trips still
 *  display a readable reference. */
export function displayPnr(booking: any): string {
  if (booking?.pnr) return booking.pnr;
  const id = booking?._id || booking?.id;
  return id ? String(id).slice(-8).toUpperCase() : '--';
}

/** Timeline steps for a booking. The user's lifecycle: Booked → Payment
 *  Verified → Ticket Confirmed → Boarded → Journey Completed. */
export function timelineSteps(booking: any) {
  const effective = effectiveTripStatus(booking);
  const cancelled = effective === 'cancelled';
  const expired = effective === 'expired';
  const confirmed = CONFIRMED.includes(booking?.status);
  const completed = effective === 'completed';
  return [
    { key: 'timeline.booked', done: true, icon: 'event' },
    { key: 'timeline.paymentVerified', done: (confirmed || completed) && !cancelled && !expired, icon: 'payments' },
    { key: 'timeline.ticketConfirmed', done: (confirmed || completed) && !cancelled && !expired, icon: 'confirmation_number' },
    { key: 'timeline.boarded', done: completed, icon: 'directions_bus' },
    { key: 'timeline.journeyCompleted', done: completed, icon: 'flag' },
  ];
}

/** Nicely formats the stored bookingDate string (e.g. "2026-8-5"). */
export function formatBookingDate(d: string | undefined): string {
  if (!d) return '--';
  const m = String(d).match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return String(d);
  const [, y, mo, day] = m;
  try {
    const date = new Date(Number(y), Number(mo) - 1, Number(day));
    return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
  } catch {
    return `${day}/${mo}/${y}`;
  }
}

export function formatHour(h: number | string | undefined): string {
  if (h === undefined || h === null || h === '') return '--';
  return formatClockTime(h);
}

export function money(n: number | string | undefined): string {
  const v = Number(n || 0);
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(v);
  } catch {
    return `Rs. ${v.toLocaleString('en-IN')}`;
  }
}

/** Fallback bus image when a legacy booking has no snapshot. Uses a local
 *  SVG data URI to avoid broken-image icons and external URL dependencies. */
export const FALLBACK_BUS_IMAGE = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">' +
  '<rect fill="#f5f6f8" width="100" height="100"/>' +
  '<text x="50" y="55" text-anchor="middle" fill="#b0b0b8" font-family="sans-serif" font-size="11" font-weight="600">No Image</text>' +
  '</svg>'
);

export function bookingBusImage(b: any): string {
  return b?.busDetails?.image || FALLBACK_BUS_IMAGE;
}

/** Returns whether a booking can be cancelled (active status, not expired). */
export function canCancel(booking: any): boolean {
  const effective = effectiveTripStatus(booking);
  return ACTIVE_STATUSES.includes(booking?.status) && effective !== 'expired' && effective !== 'cancelled' && effective !== 'completed';
}

/** Returns whether a booking can be tracked (active and not cancelled/expired). */
export function canTrack(booking: any): boolean {
  const effective = effectiveTripStatus(booking);
  return ACTIVE_STATUSES.includes(booking?.status) && effective !== 'cancelled' && effective !== 'expired' && effective !== 'completed';
}
