const Route = require("../models/route");
const Bus = require("../models/bus");
const { getSoldSeats, getSegmentSoldSeats } = require("./seatReservation");
const { tReq } = require("../services/i18n");
const { getBusRatingStatsMap } = require("../services/reviewService");

exports.getavailableroutes = async (req, res) => {
  try {
    const [routes, buses] = await Promise.all([
      Route.find().lean().exec(),
      Bus.find().select("routes").lean().exec(),
    ]);
    const items = routes.map((route) => {
      const refs = Array.isArray(route._id) ? route._id : [route._id];
      const count = buses.filter((bus) => {
        if (!bus || !bus.routes) return false;
        const busRefs = Array.isArray(bus.routes) ? bus.routes : [bus.routes];
        return busRefs.some((ref) => ref && refs.some((id) => String(id) === String(ref)));
      }).length;
      return {
        _id: route._id,
        departure: (route.departureLocation && route.departureLocation.name) || "",
        arrival: (route.arrivalLocation && route.arrivalLocation.name) || "",
        duration: route.duration,
        busCount: count,
      };
    });
    res.json({ routes: items });
  } catch (err) {
    console.error("getavailableroutes error:", err.message);
    res.status(500).json({ success: false, message: tReq(req, "route.errLoad") });
  }
};

exports.getoneroute = async (req, res) => {
  try {
    let departure = req.params.departure;
    let arrival = req.params.arrival;
    let date = req.params.date;

    if (!departure || !arrival || !date) {
      return res.status(400).json({
        success: false,
        message: tReq(req, "route.fieldsRequired"),
      });
    }

    let routes = await Route.find().lean().exec();
    const d = String(departure).toLowerCase().trim();
    const a = String(arrival).toLowerCase().trim();

    // Find exact match first, then try to find any route that contains both
    let route = routes.find((route) => {
      const routeDeparture = (route.departureLocation && route.departureLocation.name || "").toLowerCase().trim();
      const routeArrival = (route.arrivalLocation && route.arrivalLocation.name || "").toLowerCase().trim();
      return routeDeparture === d && routeArrival === a;
    });

    // If no exact match, find any route containing both stops
    if (!route) {
      route = routes.find((r) => {
        if (!r.stops || r.stops.length === 0) return false;
        const hasFrom = r.stops.some((s) => s.stopName.toLowerCase().trim() === d);
        const hasTo = r.stops.some((s) => s.stopName.toLowerCase().trim() === a);
        if (!hasFrom || !hasTo) return false;
        const fromStop = r.stops.find((s) => s.stopName.toLowerCase().trim() === d);
        const toStop = r.stops.find((s) => s.stopName.toLowerCase().trim() === a);
        return fromStop && toStop && fromStop.sequence < toStop.sequence;
      });
    }

    if (!route) {
      return res.status(404).json({
        success: false,
        message: tReq(req, "route.notFound"),
      });
    }

    let buses = await Bus.find();
    const routeId = route._id.toString();
    let matchedbuses = buses.filter((bus) => {
      if (!bus || !bus.routes) return false;
      const refs = Array.isArray(bus.routes) ? bus.routes : [bus.routes];
      return refs.some((ref) => ref && ref.toString() === routeId);
    });

    // Time-aware filtering: if searching today, exclude buses that already departed
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];
    if (date === todayStr) {
      const istNow = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
      const currentMinutes = istNow.getHours() * 60 + istNow.getMinutes();
      matchedbuses = matchedbuses.filter((bus) => {
        const depStr = bus.departureTime || "00:00";
        const parts = String(depStr).split(":");
        const depMinutes = (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0);
        return depMinutes > currentMinutes;
      });
    }

    const busidwithseatobj = {};
    for (let i = 0; i < matchedbuses.length; i++) {
      const soldSeats = await getSoldSeats(matchedbuses[i]._id.toString(), date);
      busidwithseatobj[matchedbuses[i]._id.toString()] = soldSeats;
    }

    // Real review stats (visible reviews only) keyed by busId — replaces the
    // static seeded `rating` arrays on the frontend.
    const reviewStatsMap = await getBusRatingStatsMap(matchedbuses.map((b) => b._id));

    res.send({
      route: route,
      matchedBuses: matchedbuses,
      busidwithseatobj,
      reviewStats: reviewStatsMap,
    });
  } catch (err) {
    console.error("getoneroute error:", err.message);
    res.status(500).json({
      success: false,
      message: tReq(req, "route.errFetch"),
    });
  }
};
