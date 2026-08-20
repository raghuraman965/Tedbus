/**
 * Advanced bus search controller with:
 * - Intermediate stop matching
 * - Time-aware departure filtering
 * - Next-day/next-available date fallback
 * - Segment-aware seat availability
 */
const Route = require("../models/route");
const Bus = require("../models/bus");
const SeatLock = require("../models/seatLock");
const Booking = require("../models/booking");
const { getSegmentSoldSeats, getSoldSeats } = require("./seatReservation");
const { calculateSegmentDistance } = require("../services/fareService");
const { tReq } = require("../services/i18n");

/**
 * Time string "HH:MM" to minutes from midnight.
 */
function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const parts = String(timeStr).split(":");
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  return h * 60 + m;
}

/**
 * Check if a bus operates on a given date (by operatingDays).
 */
function busOperatesOnDate(bus, dateStr) {
  const operatingDays = bus.operatingDays;
  if (!operatingDays || operatingDays.length === 0 || operatingDays.length === 7) {
    return true; // daily
  }
  const date = new Date(dateStr + "T00:00:00+05:30");
  const dayOfWeek = date.getDay(); // 0=Sun
  return operatingDays.includes(dayOfWeek);
}

/**
 * Parse "HH:MM" departure time and combine with date to get a full datetime.
 * Uses IST (Asia/Kolkata) timezone.
 */
function departureDateTime(dateStr, timeStr) {
  const minutes = timeToMinutes(timeStr);
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return new Date(`${dateStr}T${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}:00+05:30`);
}

/**
 * Find the next N operating dates for a bus starting from a given date.
 */
function getNextOperatingDates(bus, fromDate, count = 7) {
  const dates = [];
  let current = new Date(fromDate + "T00:00:00+05:30");
  const maxDays = count * 3; // safety limit

  for (let i = 0; i < maxDays && dates.length < count; i++) {
    const dateStr = current.toISOString().split("T")[0];
    if (busOperatesOnDate(bus, dateStr)) {
      dates.push(dateStr);
    }
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

/**
 * Main search endpoint: GET /search/:from/:to/:date?passengers=N
 *
 * Returns buses that:
 * 1. Operate on a route containing both `from` and `to` stops
 * 2. from.stopSequence < to.stopSequence
 * 3. Operate on the given date (operatingDays)
 * 4. Departure time has not yet passed (for today's date)
 * 5. Have segment-aware available seats
 */
exports.searchBuses = async (req, res) => {
  try {
    const { from, to, date } = req.params;
    const passengers = parseInt(req.query.passengers, 10) || 1;

    if (!from || !to || !date) {
      return res.status(400).json({
        success: false,
        message: tReq(req, "route.fieldsRequired"),
      });
    }

    // Find all routes that contain both stops
    const allRoutes = await Route.find({ isActive: { $ne: false } }).lean().exec();
    const matchingRoutes = [];

    for (const route of allRoutes) {
      if (!route.stops || route.stops.length < 2) continue;

      const fromLower = from.toLowerCase().trim();
      const toLower = to.toLowerCase().trim();

      const fromStop = route.stops.find(
        (s) => s.stopName.toLowerCase().trim() === fromLower
      );
      const toStop = route.stops.find(
        (s) => s.stopName.toLowerCase().trim() === toLower
      );

      if (fromStop && toStop && fromStop.sequence < toStop.sequence) {
        matchingRoutes.push({
          route,
          fromStop,
          toStop,
        });
      }
    }

    if (matchingRoutes.length === 0) {
      return res.json({
        success: true,
        buses: [],
        nextAvailableDates: [],
        message: "No routes found",
      });
    }

    // Find buses on matching routes
    const routeIds = matchingRoutes.map((mr) => mr.route._id.toString());
    const allBuses = await Bus.find({
      routes: { $in: routeIds },
    }).lean().exec();

    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];
    const isToday = date === todayStr;

    // Current IST time in minutes from midnight
    const istNow = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const currentMinutes = istNow.getHours() * 60 + istNow.getMinutes();

    const results = [];
    const nextAvailableDates = new Set();

    for (const bus of allBuses) {
      const routeMatch = matchingRoutes.find(
        (mr) => mr.route._id.toString() === bus.routes.toString()
      );
      if (!routeMatch) continue;

      // Check operating day
      if (!busOperatesOnDate(bus, date)) {
        // Collect next operating dates for this bus
        const nextDates = getNextOperatingDates(bus, date, 3);
        nextDates.forEach((d) => nextAvailableDates.add(d));
        continue;
      }

      // Check departure time (skip if already departed today)
      if (isToday) {
        const depMinutes = timeToMinutes(bus.departureTime);
        if (depMinutes <= currentMinutes) {
          // Bus departed, collect next operating dates
          const nextDates = getNextOperatingDates(bus, date, 3);
          nextDates.forEach((d) => nextAvailableDates.add(d));
          continue;
        }
      }

      // Calculate segment info
      const segmentDistance = calculateSegmentDistance(
        routeMatch.route.stops,
        routeMatch.fromStop.sequence,
        routeMatch.toStop.sequence
      );

      // Get segment-aware sold seats
      const soldSeats = await getSegmentSoldSeats(
        bus._id.toString(),
        date,
        routeMatch.fromStop.sequence,
        routeMatch.toStop.sequence,
        bus.totalSeats || 40
      );

      const totalSeats = bus.totalSeats || 40;
      const availableSeats = totalSeats - soldSeats.length;

      // Check if enough seats for passenger count
      if (availableSeats < passengers) {
        continue;
      }

      // Calculate duration between the two stops
      const depMinutes = timeToMinutes(routeMatch.fromStop.departureTime);
      const arrMinutes = timeToMinutes(routeMatch.toStop.arrivalTime);
      let durationMinutes = arrMinutes - depMinutes;
      if (durationMinutes < 0) durationMinutes += 24 * 60;
      const durationHours = durationMinutes / 60;

      // Calculate occupancy for fare
      const occupancyPercent = Math.round((soldSeats.length / totalSeats) * 100);

      results.push({
        bus: {
          _id: bus._id,
          operatorName: bus.operatorName,
          busType: bus.busType,
          departureTime: bus.departureTime,
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
        },
        segment: {
          fromStop: routeMatch.fromStop,
          toStop: routeMatch.toStop,
          distanceKm: segmentDistance,
          durationMinutes,
          durationHours,
          boardingPoints: routeMatch.fromStop.boardingPoints.length
            ? routeMatch.fromStop.boardingPoints
            : [routeMatch.fromStop.stopName],
          droppingPoints: routeMatch.toStop.droppingPoints.length
            ? routeMatch.toStop.droppingPoints
            : [routeMatch.toStop.stopName],
        },
        availability: {
          totalSeats,
          soldSeats: soldSeats.length,
          availableSeats,
          occupancyPercent,
          soldSeatNumbers: soldSeats,
        },
        journeyDate: date,
        isToday,
      });
    }

    // Sort by departure time
    results.sort((a, b) => {
      return timeToMinutes(a.bus.departureTime) - timeToMinutes(b.bus.departureTime);
    });

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

    const boardingStop = route.stops.find((s) => s.sequence === fromSeq);
    const droppingStop = route.stops.find((s) => s.sequence === toSeq);

    res.json({
      success: true,
      boarding: boardingStop
        ? {
            name: boardingStop.stopName,
            sequence: boardingStop.sequence,
            departureTime: boardingStop.departureTime,
            boardingPoints: boardingStop.boardingPoints.length
              ? boardingStop.boardingPoints
              : [boardingStop.stopName],
            distanceFromOrigin: boardingStop.distanceFromOrigin,
          }
        : null,
      dropping: droppingStop
        ? {
            name: droppingStop.stopName,
            sequence: droppingStop.sequence,
            arrivalTime: droppingStop.arrivalTime,
            droppingPoints: droppingStop.droppingPoints.length
              ? droppingStop.droppingPoints
              : [droppingStop.stopName],
            distanceFromOrigin: droppingStop.distanceFromOrigin,
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
