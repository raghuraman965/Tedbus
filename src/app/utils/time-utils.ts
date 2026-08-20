/**
 * Unified time utility for TedBus.
 *
 * Single source of truth for all time parsing, formatting, and duration
 * calculations across the entire Angular frontend.
 *
 * RULES:
 * - NEVER display raw decimal values to the user
 * - NEVER append ":00" to a number without formatting
 * - NEVER use parseInt on "HH:MM" strings
 * - All clock times must go through formatClockTime()
 * - All durations must go through formatDuration()
 */

/**
 * Parse a departure/arrival time value into total minutes from midnight.
 * Accepts:
 *   - "HH:MM" string (e.g. "22:30" → 1350)
 *   - "HH" string (e.g. "22" → 1320)
 *   - number (treated as hours, e.g. 22.5 → 1350)
 *   - null/undefined → 0
 */
export function parseTimeToMinutes(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;

  if (typeof value === 'number') {
    return Math.round(value * 60);
  }

  const str = String(value).trim();
  if (!str) return 0;

  if (str.includes(':')) {
    const [h, m] = str.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return 0;
    return (h % 24) * 60 + (m % 60);
  }

  const num = parseFloat(str);
  if (isNaN(num)) return 0;

  // If it looks like a decimal hour (e.g. "1.333"), convert properly
  if (str.includes('.')) {
    return Math.round(num * 60);
  }

  return (parseInt(str, 10) % 24) * 60;
}

/**
 * Parse duration (stored as decimal hours in the route model) into total minutes.
 * e.g. 4.33 → 260 minutes
 */
export function parseDurationToMinutes(duration: number | null | undefined): number {
  if (!duration || duration <= 0) return 0;
  return Math.round(duration * 60);
}

/**
 * Add minutes to a departure time (in minutes from midnight) and wrap around 24h.
 * Returns arrival time in minutes from midnight.
 */
export function addMinutesToDeparture(departureMinutes: number, durationMinutes: number): number {
  return (departureMinutes + durationMinutes) % (24 * 60);
}

/**
 * Convert total minutes from midnight to 12-hour clock format.
 * Returns { hours12, minutes, period } where hours12 is 1-12 and period is "AM"/"PM".
 */
export function to12HourClock(totalMinutes: number): { hours12: number; minutes: number; period: 'AM' | 'PM' } {
  const normalized = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const h24 = Math.floor(normalized / 60);
  const m = normalized % 60;
  const period: 'AM' | 'PM' = h24 < 12 ? 'AM' : 'PM';
  const hours12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return { hours12, minutes: m, period };
}

/**
 * Format a clock time from any input into "09:00 AM" format.
 * This is the ONE function all components should use for clock display.
 */
export function formatClockTime(value: string | number | null | undefined, ampmLabels?: { am: string; pm: string }): string {
  const minutes = parseTimeToMinutes(value);
  const { hours12, minutes: m, period } = to12HourClock(minutes);

  let periodLabel: string;
  if (ampmLabels) {
    periodLabel = period === 'AM' ? ampmLabels.am : ampmLabels.pm;
  } else {
    periodLabel = period;
  }

  return `${String(hours12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${periodLabel}`;
}

/**
 * Format departure + arrival times into a display range.
 * "09:00 AM → 01:20 PM"
 */
export function formatTimeRange(
  departure: string | number | null | undefined,
  arrival: string | number | null | undefined,
  ampmLabels?: { am: string; pm: string }
): string {
  return `${formatClockTime(departure, ampmLabels)} → ${formatClockTime(arrival, ampmLabels)}`;
}

/**
 * Format duration from decimal hours into human-readable string.
 * 4.33 → "4h 20m"
 * 0 → "0h 00m"
 */
export function formatDuration(decimalHours: number | null | undefined): string {
  if (!decimalHours || decimalHours <= 0) return '0h 00m';
  const totalMinutes = Math.round(decimalHours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

/**
 * Format a boarding/dropping point time for display.
 * Returns formatted string or fallback if time is unavailable.
 */
export function formatPointTime(
  baseTime: string | number | null | undefined,
  offsetMinutes: number,
  ampmLabels?: { am: string; pm: string }
): string {
  const base = parseTimeToMinutes(baseTime);
  const pointMinutes = (base + offsetMinutes) % (24 * 60);
  return formatClockTime(pointMinutes, ampmLabels);
}

/**
 * Determine if a journey date is "Today", "Tomorrow", or a formatted date.
 */
export function getJourneyDateLabel(journeyDate: string | Date): string {
  if (!journeyDate) return '';

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  let target: Date;
  if (journeyDate instanceof Date) {
    target = new Date(journeyDate.getFullYear(), journeyDate.getMonth(), journeyDate.getDate());
  } else {
    const parsed = new Date(String(journeyDate));
    if (isNaN(parsed.getTime())) return String(journeyDate);
    target = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  }

  const diffMs = target.getTime() - today.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays < 0) return String(journeyDate);

  return String(journeyDate);
}

/**
 * Check if a journey is overnight (arrival is on the next day).
 */
export function isOvernightJourney(departure: string | number, arrival: string | number): boolean {
  const depMinutes = parseTimeToMinutes(departure);
  const arrMinutes = parseTimeToMinutes(arrival);
  return arrMinutes < depMinutes;
}
