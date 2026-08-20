/**
 * Fare calculation engine for segment-based bus booking.
 *
 * Calculates fare based on:
 * - Segment distance (distance between boarding and dropping stops)
 * - Route fare configuration (pricePerKm, baseFare, minimumFare)
 * - Bus type multiplier (AC, Sleeper, etc.)
 * - Seat type premium (window, sleeper berth, etc.)
 * - Dynamic pricing (occupancy-based surcharge)
 * - Weekend/holiday surcharge
 * - Tax and service fee
 */

/**
 * Calculate the fare for a given segment.
 * @param {Object} fareConfig - Route's fareConfig from the database
 * @param {Object} params - { distanceKm, busType, seatType, occupancyPercent, isWeekend, totalSeats, seatCount }
 * @returns {Object} Fare breakdown
 */
function calculateFare(fareConfig, params) {
  const {
    distanceKm = 0,
    busType = "standard",
    seatType = "regular",
    occupancyPercent = 0,
    isWeekend = false,
    totalSeats = 40,
    seatCount = 1,
  } = params;

  const cfg = fareConfig || {};
  const pricePerKm = cfg.pricePerKm || 1.5;
  const baseFare = cfg.baseFare || 0;
  const minimumFare = cfg.minimumFare || 50;
  const taxPercent = cfg.taxPercent || 5;
  const serviceFee = cfg.serviceFee || 10;

  // Base segment fare
  let segmentFare = Math.max(baseFare, distanceKm * pricePerKm);

  // Apply minimum fare
  segmentFare = Math.max(segmentFare, minimumFare);

  // Bus type multiplier
  const multipliers = cfg.busTypeMultipliers instanceof Map
    ? Object.fromEntries(cfg.busTypeMultipliers)
    : (cfg.busTypeMultipliers || { standard: 1.0 });
  const busMultiplier = multipliers[busType] || multipliers.standard || 1.0;
  segmentFare *= busMultiplier;

  // Seat type premium
  const premiums = cfg.seatTypePremiums instanceof Map
    ? Object.fromEntries(cfg.seatTypePremiums)
    : (cfg.seatTypePremiums || {});
  const seatPremium = premiums[seatType] || 0;
  segmentFare += seatPremium;

  // Dynamic pricing
  let dynamicFare = 0;
  const dp = cfg.dynamicPricing || {};
  if (dp.enabled && totalSeats > 0) {
    const thresholds = dp.thresholds || {};
    const surcharges = dp.surcharges || {};

    if (occupancyPercent >= (thresholds.highOccupancy || 90)) {
      dynamicFare = segmentFare * ((surcharges.peak || 15) / 100);
    } else if (occupancyPercent >= (thresholds.midOccupancy || 75)) {
      dynamicFare = segmentFare * ((surcharges.high || 10) / 100);
    } else if (occupancyPercent >= (thresholds.lowOccupancy || 50)) {
      dynamicFare = segmentFare * ((surcharges.mid || 5) / 100);
    }

    // Weekend/holiday surcharge
    if (isWeekend) {
      const weekendMult = dp.weekendMultiplier || 1.05;
      segmentFare *= weekendMult;
    }
  }

  // Round to nearest integer
  segmentFare = Math.round(segmentFare);
  dynamicFare = Math.round(dynamicFare);

  const subtotal = segmentFare + dynamicFare;
  const tax = Math.round(subtotal * (taxPercent / 100));
  const totalFare = subtotal + tax + serviceFee;

  const perSeat = totalFare;

  return {
    baseFare: segmentFare,
    seatFare: seatPremium,
    dynamicFare,
    tax,
    serviceFee,
    totalFare,
    perSeat,
    totalForSeats: perSeat * seatCount,
    pricePerKm,
    distance: distanceKm,
    breakdown: {
      distanceKm,
      pricePerKm,
      busType,
      busMultiplier,
      seatType,
      seatPremium,
      dynamicFare,
      taxPercent,
      tax,
      serviceFee,
      isWeekend,
    },
  };
}

/**
 * Calculate distance between two stops given a route's stops array.
 * @param {Array} stops - Route stops array (sorted by sequence)
 * @param {Number} fromSequence - Boarding stop sequence
 * @param {Number} toSequence - Dropping stop sequence
 * @returns {Number} Distance in km
 */
function calculateSegmentDistance(stops, fromSequence, toSequence) {
  if (!stops || !stops.length) return 0;
  if (fromSequence >= toSequence) return 0;

  const fromStop = stops.find((s) => s.sequence === fromSequence);
  const toStop = stops.find((s) => s.sequence === toSequence);

  if (!fromStop || !toStop) return 0;

  return Math.abs(toStop.distanceFromOrigin - fromStop.distanceFromOrigin);
}

/**
 * Calculate the journey duration between two stops.
 * @param {Array} stops - Route stops array (sorted by sequence)
 * @param {String} departureTime - Format "HH:MM"
 * @param {String} arrivalTime - Format "HH:MM"
 * @returns {String} Duration string like "5h 30m"
 */
function calculateDuration(departureTime, arrivalTime) {
  const parse = (t) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  let diff = parse(arrivalTime) - parse(departureTime);
  if (diff < 0) diff += 24 * 60;
  const hours = Math.floor(diff / 60);
  const mins = diff % 60;
  return `${hours}h ${mins}m`;
}

/**
 * Calculate occupancy percentage for dynamic pricing.
 * @param {Number} bookedCount - Number of seats booked on this bus+date
 * @param {Number} totalSeats - Total seats on the bus
 * @returns {Number} Percentage 0-100
 */
function calculateOccupancy(bookedCount, totalSeats) {
  if (!totalSeats) return 0;
  return Math.min(100, Math.round((bookedCount / totalSeats) * 100));
}

module.exports = {
  calculateFare,
  calculateSegmentDistance,
  calculateDuration,
  calculateOccupancy,
};
