const Bus = require("../models/bus");
const Route = require("../models/route");
const Booking = require("../models/booking");
const BusLocation = require("../models/busLocation");

function parseTime(str) {
  if (!str) return 0;
  const s = String(str).trim();
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  const parts = s.split(":");
  if (parts.length === 2) return parseInt(parts[0], 10) + parseInt(parts[1], 10) / 60;
  return 0;
}

function formatTime(hoursDecimal) {
  let h = Math.floor(hoursDecimal) % 24;
  let m = Math.round((hoursDecimal - Math.floor(hoursDecimal)) * 60);
  if (m === 60) { h++; m = 0; }
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function interpolatePosition(stops, progressFraction) {
  if (!stops || stops.length === 0) return { latitude: 0, longitude: 0, speed: 0, heading: 0 };
  if (stops.length === 1) return { latitude: stops[0].latitude || 0, longitude: stops[0].longitude || 0, speed: 50, heading: 0 };

  const totalDist = stops[stops.length - 1].distanceFromOrigin || 1;
  const targetDist = progressFraction * totalDist;

  let prev = stops[0];
  let next = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    const d0 = stops[i].distanceFromOrigin || 0;
    const d1 = stops[i + 1].distanceFromOrigin || 0;
    if (targetDist >= d0 && targetDist <= d1) {
      prev = stops[i];
      next = stops[i + 1];
      break;
    }
    if (targetDist > d1) {
      prev = stops[i + 1];
      next = stops[i + 1];
    }
  }

  const segDist = (next.distanceFromOrigin || 0) - (prev.distanceFromOrigin || 0);
  const t = segDist > 0 ? (targetDist - (prev.distanceFromOrigin || 0)) / segDist : 1;
  const clamped = Math.max(0, Math.min(1, t));

  const lat = (prev.latitude || 0) + clamped * ((next.latitude || 0) - (prev.latitude || 0));
  const lng = (prev.longitude || 0) + clamped * ((next.longitude || 0) - (prev.longitude || 0));

  const dLat = (next.latitude || 0) - (prev.latitude || 0);
  const dLng = (next.longitude || 0) - (prev.longitude || 0);
  let heading = Math.atan2(dLng, dLat) * (180 / Math.PI);
  if (heading < 0) heading += 360;

  return { latitude: lat, longitude: lng, speed: 0, heading: heading };
}

function buildTrackingData(bus, route, date) {
  const stops = (route.stops || []).slice().sort((a, b) => a.sequence - b.sequence);
  if (stops.length === 0) {
    return { error: "No stops found for this route" };
  }

  const depHour = parseTime(bus.departureTime);
  const durationHours = route.duration || 7;
  const arrHour = depHour + durationHours;

  const now = new Date();
  const currentHour = now.getHours() + now.getMinutes() / 60;
  const depDate = new Date(date + "T00:00:00");
  const isSameDay = now.toDateString() === depDate.toDateString();

  let progress = 0;
  let status = "not_started";
  if (isSameDay || date === formatToday()) {
    if (currentHour < depHour) {
      progress = 0;
      status = "not_started";
    } else if (currentHour >= arrHour) {
      progress = 1;
      status = "completed";
    } else {
      progress = (currentHour - depHour) / durationHours;
      status = "in_progress";
    }
  } else {
    const depDateMs = depDate.getTime();
    const nowMs = now.getTime();
    if (nowMs < depDateMs) {
      progress = 0;
      status = "not_started";
    } else if (nowMs > depDateMs + durationHours * 3600 * 1000) {
      progress = 1;
      status = "completed";
    } else {
      progress = (nowMs - depDateMs) / (durationHours * 3600 * 1000);
      status = "in_progress";
    }
  }

  const baseSpeed = 40 + (durationHours > 6 ? 10 : 0) + (durationHours > 10 ? 5 : 0);
  const speedVariation = Math.sin(progress * Math.PI * 4) * 8;
  const speed = status === "in_progress" ? Math.round(baseSpeed + speedVariation) : 0;

  const seed = hashCode(bus._id.toString() + date);
  const delayMinutes = status === "not_started" ? 0 : ((seed % 21) - 10);

  const pos = interpolatePosition(stops, progress);
  pos.speed = speed;

  const totalDistance = route.totalDistanceKm || (stops.length * 50);
  const distanceCovered = Math.round(progress * totalDistance);

  const crossedStops = Math.floor(progress * (stops.length - 1));
  const currentStopIdx = status === "completed" ? stops.length - 1 : Math.min(crossedStops, stops.length - 1);

  let etaMinutes = 0;
  if (status === "in_progress") {
    etaMinutes = Math.round((arrHour - currentHour) * 60);
    if (delayMinutes > 0) etaMinutes += delayMinutes;
  } else if (status === "not_started") {
    etaMinutes = Math.round((depHour - currentHour) * 60 + durationHours * 60);
  }

  const stopsData = stops.map((s, i) => {
    const stopHour = depHour + (parseTime(s.departureTime) - parseTime(stops[0].departureTime));
    let stopStatus = "upcoming";
    if (status === "completed" || i < crossedStops) {
      stopStatus = "crossed";
    } else if (i === currentStopIdx && status === "in_progress") {
      stopStatus = "current";
    }

    const stopEta = status === "in_progress" ? Math.max(0, Math.round((stopHour - currentHour) * 60)) : 0;

    return {
      name: s.stopName || `Stop ${s.sequence}`,
      sequence: s.sequence,
      arrivalTime: s.arrivalTime || formatTime(stopHour),
      departureTime: s.departureTime || formatTime(stopHour),
      latitude: s.latitude || 0,
      longitude: s.longitude || 0,
      distanceFromOrigin: s.distanceFromOrigin || 0,
      status: stopStatus,
      etaMinutes: stopStatus === "upcoming" ? stopEta : 0,
      scheduledTime: formatTime(stopHour),
    };
  });

  return {
    busId: bus._id.toString(),
    date,
    operatorName: bus.operatorName || "",
    busType: bus.busType || "",
    routeName: route.routeName || `${route.departureLocation?.name || ""} → ${route.arrivalLocation?.name || ""}`,
    departureLocation: route.departureLocation?.name || "",
    arrivalLocation: route.arrivalLocation?.name || "",
    currentLocation: {
      latitude: pos.latitude,
      longitude: pos.longitude,
      speed: pos.speed,
      heading: pos.heading,
    },
    journey: {
      progress: Math.round(progress * 100 * 10) / 10,
      totalStops: stops.length,
      crossedStops: Math.min(crossedStops, stops.length - 1),
      currentStopIndex: currentStopIdx,
      remainingStops: Math.max(0, stops.length - 1 - crossedStops),
      distanceTotal: totalDistance,
      distanceCovered: Math.min(distanceCovered, totalDistance),
      etaMinutes: Math.max(0, etaMinutes),
      status,
      delayMinutes,
      departureTime: bus.departureTime || "00:00",
      arrivalTime: formatTime(arrHour),
      durationHours,
    },
    stops: stopsData,
  };
}

function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

function formatToday() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

exports.getTracking = async (req, res) => {
  try {
    const { busId, date } = req.params;
    const bus = await Bus.findById(busId).lean().exec();
    if (!bus) return res.status(404).json({ error: "Bus not found" });

    const route = await Route.findById(bus.routes).lean().exec();
    if (!route) return res.status(404).json({ error: "Route not found" });

    const result = buildTrackingData(bus, route, date);
    if (result.error) return res.status(404).json({ error: result.error });

    await BusLocation.findOneAndUpdate(
      { busId: bus._id.toString(), date },
      {
        latitude: result.currentLocation.latitude,
        longitude: result.currentLocation.longitude,
        speed: result.currentLocation.speed,
        heading: result.currentLocation.heading,
        currentStopSequence: result.journey.currentStopIndex,
        updatedAt: new Date(),
      },
      { upsert: true }
    ).catch(() => {});

    res.json(result);
  } catch (err) {
    console.error("[tracking] getTracking error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.getStopTimeline = async (req, res) => {
  try {
    const { busId, date } = req.params;
    const bus = await Bus.findById(busId).lean().exec();
    if (!bus) return res.status(404).json({ error: "Bus not found" });

    const route = await Route.findById(bus.routes).lean().exec();
    if (!route) return res.status(404).json({ error: "Route not found" });

    const tracking = buildTrackingData(bus, route, date);
    if (tracking.error) return res.status(404).json({ error: tracking.error });

    res.json({
      busId: tracking.busId,
      date: tracking.date,
      stops: tracking.stops,
      summary: {
        total: tracking.stops.length,
        crossed: tracking.stops.filter(s => s.status === "crossed").length,
        current: tracking.stops.filter(s => s.status === "current").length,
        remaining: tracking.stops.filter(s => s.status === "upcoming").length,
      },
    });
  } catch (err) {
    console.error("[tracking] getStopTimeline error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.myBookings = async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: "Not authenticated" });

    const today = formatToday();
    const bookings = await Booking.find({
      customerId: userId,
      status: { $in: ["ticket_confirmed", "upcoming", "completed"] },
      journeyDate: { $gte: today },
    })
      .sort({ journeyDate: 1 })
      .lean()
      .exec();

    const enriched = bookings.map((b) => {
      const hasTracking = true;
      return {
        bookingId: b._id.toString(),
        pnr: b.pnr || "",
        busId: b.busId,
        routeName: b.departureDetails?.city && b.arrivalDetails?.city
          ? `${b.departureDetails.city} → ${b.arrivalDetails.city}`
          : "",
        departureCity: b.departureDetails?.city || "",
        arrivalCity: b.arrivalDetails?.city || "",
        departureDate: b.departureDetails?.date || b.journeyDate || "",
        departureTime: b.departureDetails?.time || "",
        arrivalTime: b.arrivalDetails?.time || "",
        seats: b.seats || [],
        seatCount: (b.seats || []).length,
        status: b.status,
        operatorName: b.busDetails?.operatorName || "",
        busType: b.busDetails?.busType || "",
        trackingAvailable: hasTracking,
      };
    });

    res.json({ bookings: enriched });
  } catch (err) {
    console.error("[tracking] myBookings error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};
