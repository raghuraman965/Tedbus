/**
 * Advanced bus search controller.
 *
 * Availability is calculated against the REQUESTED BOARDING STOP, not the
 * route's first stop: a bus that already left its origin can still be
 * bookable from a downstream stop it has not reached yet, and once it passed
 * the requested stop it must never appear again.
 *
 * Every result carries a SERVER-COMPUTED fare quote for the exact requested
 * segment (distance × configured rate × bus-type multiplier + seat premium +
* dynamic/weekend surcharge + tax + service fee). The frontend never prices
 * bookings itself.
 */
const Route = require("../models/route");
const Bus = require("../models/bus");
const { getSegmentSoldSeats } = require("./seatReservation");
const {
  calculateSegmentDistance,
  calculateDuration,
} = require("../services/fareService");
const { tReq } = require("../services/i18n");
const { getBusRatingStatsMap } = require("../services/reviewService");

/** Time string "HH:MM" (or "HH:MM AM") to minutes from midnight. */
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

/** Check if a bus operates on a given date (by operatingDays). */
function busOperatesOnDate(bus, dateStr) {
  const operatingDays = bus.operatingDays;
  if (!operatingDays || operatingDays.length === 0 || operatingDays.length === 7) {
    return true; // daily
  }
  const date = new Date(dateStr + "T00:00:00+05:30");
  const dayOfWeek = date.getDay(); // 0=Sun
  return operatingDays.includes(dayOfWeek);
}

/** Parse "HH:MM" + date into an IST Date. */
function departureDateTime(dateStr, timeStr) {
  const minutes = timeToMinutes(timeStr) || 0;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return new Date(`${dateStr}T${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}:00+05:30`);
}

function istNowMinutes(now = new Date()) {
  const istNow = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  return istNow.getHours() * 60 + istNow.getMinutes();
}

/** Current IST date as YYYY-MM-DD. */
function istTodayStr(now = new Date()) {
  const istNow = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  return `${istNow.getFullYear()}-${String(istNow.getMonth() + 1).padStart(2, "0")}-${String(istNow.getDate()).padStart(2, "0")}`;
}

function isValidDateStr(dateStr) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(dateStr || ""));
}

function normalizeLocation(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * City-level matching: "Chennai" must find the stop "Chennai (Koyambedu
 * CMBT)" and "Puducherry" both spellings of Pondicherry. A query matches a
 * stop when it equals the stop name or is a word-boundary prefix of it.
 */
function locationMatches(queryLower, stopName) {
  const n = normalizeLocation(stopName);
  if (n === queryLower) return true;
  if (!n.startsWith(queryLower)) {
    // Common alternate spellings (Pondicherry/Puducherry, Chennai/Madras)
    const aliases = { pondicherry: "puducherry", madras: "chennai", trichy: "tiruchirappalli" };
    const qAlt = aliases[queryLower] || queryLower;
    if (qAlt === queryLower) return false;
    return locationMatches(qAlt, stopName);
  }
  const next = n.charAt(queryLower.length);
  return next === "" || next === " " || next === "(" || next === "-";
}

/** Find the next N operating dates for a bus starting from a given date. */
function getNextOperatingDates(bus, fromDate, count = 7) {
  const dates = [];
  const seen = new Set();
  let current = new Date(fromDate + "T00:00:00+05:30");
  const maxDays = count * 3; // safety limit

  for (let i = 0; i < maxDays && dates.length < count; i++) {
    const dateStr = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}-${String(current.getDate()).padStart(2, "0")}`;
    if (!seen.has(dateStr)) {
      seen.add(dateStr);
      if (dateStr >= istTodayStr() && busOperatesOnDate(bus, dateStr)) {
        dates.push(dateStr);
      }
    }
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

/**
 * Server-authoritative starting fare for ONE seat on the requested segment.
 * Mirrors the payment engine's inputs so the price shown on the card always
 * matches what /booking/payment/order will charge.
 */
async function quoteSegmentFare(route, bus, date, fromStop, toStop, soldCount) {
  const cfg = route.fareConfig || {};
  const distanceKm = calculateSegmentDistance(
    route.stops,
    fromStop.sequence,
    toStop.sequence
  );
  const totalSeats = bus.totalSeats || 40;
  const occupancyPercent = totalSeats ? Math.min(100, Math.round((soldCount / totalSeats) * 100)) : 0;

  const pricePerKm = cfg.pricePerKm || 1.5;
  let base = Math.max(cfg.baseFare || 0, distanceKm * pricePerKm);
  base = Math.max(base, cfg.minimumFare || 50);

  const multipliers = cfg.busTypeMultipliers instanceof Map
    ? Object.fromEntries(cfg.busTypeMultipliers)
    : (cfg.busTypeMultipliers || {});
  const busMultiplier = multipliers[bus.busType] != null ? multipliers[bus.busType] : (multipliers.standard != null ? multipliers.standard : 1.0);
  base *= busMultiplier;

  const premiums = cfg.seatTypePremiums instanceof Map
    ? Object.fromEntries(cfg.seatTypePremiums)
    : (cfg.seatTypePremiums || {});
  const seatPremium = premiums.regular || 0;

  // Dynamic pricing (occupancy/weekend) uses the same rules as checkout.
  let dynamicFare = 0;
  const dp = cfg.dynamicPricing || {};
  const journeyDate = new Date(date + "T12:00:00+05:30");
  const isWeekend = !isNaN(journeyDate.getTime()) && (journeyDate.getDay() === 0 || journeyDate.getDay() === 6);
  if (dp.enabled && totalSeats > 0) {
    const thresholds = dp.thresholds || {};
    const surcharges = dp.surcharges || {};
    if (occupancyPercent >= (thresholds.highOccupancy || 90)) {
      dynamicFare = base * ((surcharges.peak || 15) / 100);
    } else if (occupancyPercent >= (thresholds.midOccupancy || 75)) {
      dynamicFare = base * ((surcharges.high || 10) / 100);
    } else if (occupancyPercent >= (thresholds.lowOccupancy || 50)) {
      dynamicFare = base * ((surcharges.mid || 5) / 100);
    }
    if (isWeekend) {
      base *= dp.weekendMultiplier || 1.05;
    }
  }

  base = Math.round(base);
  dynamicFare = Math.round(dynamicFare);
  const subtotal = base + seatPremium + dynamicFare;
  const taxPercent = cfg.taxPercent != null ? cfg.taxPercent : 5;
  const tax = Math.round(subtotal * (taxPercent / 100));
  const serviceFee = cfg.serviceFee != null ? cfg.serviceFee : 10;

  return {
    currency: "INR",
    distanceKm,
    pricePerKm,
    busType: bus.busType,
    occupancyPercent,
    isWeekend,
    perSeat: {
      baseFare: base,
      seatFare: seatPremium,
      dynamicFare,
      tax,
      serviceFee,
      total: subtotal + tax + serviceFee,
    },
  };
}

/**
 * Main search endpoint: GET /search/:from/:to/:date?passengers=N
 *
 * Returns buses that:
 * 1. Run on an active route containing both stops (from.sequence < to.sequence)
 * 2. Operate on the given date (operatingDays)
 * 3. Have NOT yet departed the REQUESTED boarding stop (stop-specific time)
 * 4. Have enough segment-aware available seats
 */
exports.searchBuses = async (req, res) => {
  try {
    const { from, to, date } = req.params;
    const passengers = parseInt(req.query.passengers, 10) || 1;

    if (!from || !to || !date || !isValidDateStr(date)) {
      return res.status(400).json({
        success: false,
        message: tReq(req, "route.fieldsRequired"),
      });
    }

    const today = istTodayStr();
    if (date < today) {
      return res.status(400).json({
        success: false,
        message: "PAST_JOURNEY_DATE",
        buses: [],
        nextAvailableDates: [],
      });
    }

    const fromLower = normalizeLocation(from);
    const toLower = normalizeLocation(to);

    if (fromLower === toLower) {
      return res.status(400).json({
        success: false,
        message: "SAME_SOURCE_DESTINATION",
        buses: [],
        nextAvailableDates: [],
      });
    }

    // Find all active routes that contain both stops in the right order.
    const allRoutes = await Route.find({ isActive: { $ne: false } }).lean().exec();
    const matchingRoutes = [];

    for (const route of allRoutes) {
      if (!route.stops || route.stops.length < 2) continue;

      const fromStop = route.stops.find((s) => locationMatches(fromLower, s.stopName));
      const toStop = route.stops.find((s) => locationMatches(toLower, s.stopName));

      if (fromStop && toStop && fromStop.sequence < toStop.sequence) {
        matchingRoutes.push({ route, fromStop, toStop });
      }
    }

    if (matchingRoutes.length === 0) {
      return res.json({
        success: true,
        buses: [],
        nextAvailableDates: [],
        searchParams: { from, to, date, passengers },
      });
    }

    const routeIds = matchingRoutes.map((mr) => mr.route._id.toString());
    const allBuses = await Bus.find({
      routes: { $in: routeIds },
      isActive: { $ne: false },
    }).lean().exec();

    const now = new Date();
    const isToday = date === today;
    const currentMinutes = istNowMinutes(now);

    const results = [];
    const nextAvailableDates = new Set();

    for (const bus of allBuses) {
      const routeMatch = matchingRoutes.find(
        (mr) => mr.route._id.toString() === bus.routes.toString()
      );
      if (!routeMatch) continue;

      // Operating-day check
      if (!busOperatesOnDate(bus, date)) {
        getNextOperatingDates(bus, date, 3).forEach((d) => nextAvailableDates.add(d));
        continue;
      }

      // STOP-SPECIFIC departure check: the requested boarding stop's own
      // scheduled departure must still be in the future. A bus that left
      // Chennai at 09:00 remains bookable from Melmaruvathur (dep 11:00)
      // until 11:00 — but only if it hasn't already passed that stop.
      const boardingDepMinutes = timeToMinutes(routeMatch.fromStop.departureTime);
      if (boardingDepMinutes == null) continue;

      if (isToday && boardingDepMinutes <= currentMinutes) {
        // Departed the requested stop already. If it operates on later days,
        // surface those dates instead.
        getNextOperatingDates(bus, date, 3).forEach((d) => {
          if (d !== date) nextAvailableDates.add(d);
        });
        continue;
      }

      // Segment-aware inventory for the exact requested range
      const totalSeats = bus.totalSeats || 40;
      const soldSeats = await getSegmentSoldSeats(
        bus._id.toString(),
        date,
        routeMatch.fromStop.sequence,
        routeMatch.toStop.sequence,
        totalSeats
      );
      const availableSeats = Math.max(totalSeats - soldSeats.length, 0);

      if (availableSeats < passengers) {
        continue;
      }

      const depMinutes = boardingDepMinutes;
      const arrRaw = timeToMinutes(routeMatch.toStop.arrivalTime);
      const arrMinutes = arrRaw == null ? depMinutes : arrRaw;
      let durationMinutes = arrMinutes - depMinutes;
      if (durationMinutes <= 0) durationMinutes += 24 * 60; // overnight wrap

      const dayOffset = Math.floor((depMinutes + durationMinutes) / (24 * 60));

      // Full-journey datetimes (ISO, IST) for correct Today/Tomorrow labels
      const departureDt = departureDateTime(date, routeMatch.fromStop.departureTime);
      const arrivalDt = new Date(departureDt.getTime() + durationMinutes * 60000);

      const durationLabel = calculateDuration(
        `${String(Math.floor(depMinutes / 60)).padStart(2, "0")}:${String(depMinutes % 60).padStart(2, "0")}`,
        `${String(Math.floor(arrMinutes % (24 * 60) / 60)).padStart(2, "0")}:${String(arrMinutes % 60).padStart(2, "0")}`
      );

      // Server-authoritative fare quote for this exact segment/bus/date
      const fareQuote = await quoteSegmentFare(
        routeMatch.route,
        bus,
        date,
        routeMatch.fromStop,
        routeMatch.toStop,
        soldSeats.length
      );

      const intermediateStops = routeMatch.route.stops.filter(
        (s) =>
          s.sequence > routeMatch.fromStop.sequence &&
          s.sequence < routeMatch.toStop.sequence
      ).length;

      results.push({
        bus: {
          _id: bus._id,
          operatorName: bus.operatorName,
          busNumber: bus.busNumber || "",
          busType: bus.busType,
          amenities: bus.amenities || [],
          departureTime: routeMatch.fromStop.departureTime, // boarding-stop time
          arrivalTime: routeMatch.toStop.arrivalTime,
          totalSeats,
          images: bus.images,
          liveTracking: bus.liveTracking,
          reschedulable: bus.reschedulable,
          rating: bus.rating,
          operatingDays: bus.operatingDays,
        },
        route: {
          _id: routeMatch.route._id,
          routeName: routeMatch.route.routeName,
          departureLocation: routeMatch.route.departureLocation,
          arrivalLocation: routeMatch.route.arrivalLocation,
          totalDistanceKm: routeMatch.route.totalDistanceKm,
          fareConfig: routeMatch.route.fareConfig,
          stops: routeMatch.route.stops,
        },
        segment: {
          fromStop: routeMatch.fromStop,
          toStop: routeMatch.toStop,
          intermediateStops,
          distanceKm: fareQuote.distanceKm,
          durationMinutes,
          durationHours: Math.round((durationMinutes / 60) * 100) / 100,
          durationLabel,
          dayOffset,
          departureDateTime: departureDt.toISOString(),
          arrivalDateTime: arrivalDt.toISOString(),
          boardingPoints: routeMatch.fromStop.boardingPoints.length
            ? routeMatch.fromStop.boardingPoints
            : [routeMatch.fromStop.stopName],
          droppingPoints: routeMatch.toStop.droppingPoints.length
            ? routeMatch.toStop.droppingPoints
            : [routeMatch.toStop.stopName],
        },
        fare: fareQuote,
        availability: {
          totalSeats,
          soldSeats: soldSeats.length,
          availableSeats,
          occupancyPercent: fareQuote.occupancyPercent,
          soldSeatNumbers: soldSeats,
        },
        journeyDate: date,
        isToday,
      });
    }

    // Real review stats (visible reviews only) for every result bus.
    const reviewStatsMap = await getBusRatingStatsMap(results.map((r) => r.bus._id));
    for (const r of results) {
      r.reviewStats = reviewStatsMap[String(r.bus._id)] || { avgRating: 0, totalReviews: 0 };
    }

    // Sort by boarding-stop departure time
    results.sort(
      (a, b) => (timeToMinutes(a.bus.departureTime) || 0) - (timeToMinutes(b.bus.departureTime) || 0)
    );

    res.json({
      success: true,
      buses: results,
      nextAvailableDates: Array.from(nextAvailableDates).sort().slice(0, 7),
      searchParams: { from, to, date, passengers },
    });
  } catch (err) {
    console.error("searchBuses error:", err);
    res.status(500).json({
      success: false,
      message: tReq(req, "route.errFetch"),
    });
  }
};

/**
 * Get detailed route with all stops.
 * GET /search/route/:routeId
 */
exports.getRouteDetail = async (req, res) => {
  try {
    const route = await Route.findById(req.params.routeId).lean().exec();
    if (!route) {
      return res.status(404).json({ success: false, message: "Route not found" });
    }
    res.json({ success: true, route });
  } catch (err) {
    console.error("getRouteDetail error:", err);
    res.status(500).json({ success: false, message: "Error fetching route" });
  }
};

/**
 * Get available boarding/dropping points for a segment.
 * GET /search/points/:routeId/:fromStopSeq/:toStopSeq
 */
exports.getBoardingDroppingPoints = async (req, res) => {
  try {
    const route = await Route.findById(req.params.routeId).lean().exec();
    if (!route || !route.stops) {
      return res.status(404).json({ success: false, message: "Route not found" });
    }

    const fromSeq = parseInt(req.params.fromStopSeq, 10);
    const toSeq = parseInt(req.params.toStopSeq, 10);

    const fromStop = route.stops.find((s) => s.sequence === fromSeq);
    const toStop = route.stops.find((s) => s.sequence === toSeq);

    res.json({
      success: true,
      boarding: fromStop
        ? {
            name: fromStop.stopName,
            sequence: fromStop.sequence,
            departureTime: fromStop.departureTime,
            boardingPoints: fromStop.boardingPoints.length
              ? fromStop.boardingPoints
              : [fromStop.stopName],
            distanceFromOrigin: fromStop.distanceFromOrigin,
          }
        : null,
      dropping: toStop
        ? {
            name: toStop.stopName,
            sequence: toStop.sequence,
            arrivalTime: toStop.arrivalTime,
            droppingPoints: toStop.droppingPoints.length
              ? toStop.droppingPoints
              : [toStop.stopName],
            distanceFromOrigin: toStop.distanceFromOrigin,
          }
        : null,
    });
  } catch (err) {
    console.error("getBoardingDroppingPoints error:", err);
    res.status(500).json({ success: false, message: "Error fetching points" });
  }
};

/**
 * Get segment-specific seat availability.
 * POST /search/segment-seats
 * Body: { busId, date, fromSequence, toSequence, totalSeats }
 */
exports.getSegmentSeats = async (req, res) => {
  try {
    const { busId, date, fromSequence, toSequence, totalSeats } = req.body;
    if (!busId || !date || fromSequence == null || toSequence == null) {
      return res.status(400).json({ success: false, message: "Missing fields" });
    }

    const soldSeats = await getSegmentSoldSeats(
      busId,
      date,
      parseInt(fromSequence, 10),
      parseInt(toSequence, 10),
      parseInt(totalSeats, 10) || 40
    );

    const allSeats = Array.from(
      { length: parseInt(totalSeats, 10) || 40 },
      (_, i) => i + 1
    );
    const availableSeats = allSeats.filter((s) => !soldSeats.includes(s));

    res.json({
      success: true,
      soldSeats,
      availableSeats,
      totalSeats: allSeats.length,
      seatsLeft: availableSeats.length,
    });
  } catch (err) {
    console.error("getSegmentSeats error:", err);
    res.status(500).json({ success: false, message: "Error fetching seats" });
  }
};
