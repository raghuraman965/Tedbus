/**
 * Seeds the Chennai <-> Puducherry (Pondicherry) corridor for the segment
 * booking flow rebuild.
 *
 * - Ordered stops with real distances & times:
 *     Chennai (Koyambedu CMBT) -> Tambaram -> Chengalpattu -> Melmaruvathur
 *       -> Tindivanam -> Villupuram -> Puducherry   (196 km, ~3h55m)
 *   plus the reverse direction.
 * - 12 scheduled services (6 per direction) as Route documents, each with
 *   its own absolute stop times so multi-departure scheduling works with the
 *   stop-specific departure logic in search.js.
 * - 24+ buses across varied operators / types / layouts / amenities /
 *   operating days, including one overnight service per direction that
 *   exercises the day-offset logic.
 *
 * Idempotent: only touches documents tagged "ted-corridor".
 *
 * Usage:
 *   cd frontend/server
 *   node scripts/seed-pondy-corridor.js
 */
const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const Route = require("../models/route");
const Bus = require("../models/bus");
const Booking = require("../models/booking");
const SeatLock = require("../models/seatLock");
const CancellationPolicy = require("../models/cancellationPolicy");

const CORRIDOR_TAG = "ted-corridor";

// ---------------------------------------------------------------------------
// Corridor geography (cumulative km from each direction's origin)
// ---------------------------------------------------------------------------
const FORWARD_STOPS = [
  { stopName: "Chennai (Koyambedu CMBT)", stopId: "CMBT", km: 0, min: 0,
    lat: 13.0695, lng: 80.1946,
    boardingPoints: ["Koyambedu CMBT Bay 1", "Koyambedu CMBT Bay 14"],
    droppingPoints: ["Koyambedu CMBT"] },
  { stopName: "Tambaram", stopId: "TBM", km: 28, min: 40,
    lat: 12.9249, lng: 80.1000,
    boardingPoints: ["Tambaram Sanatorium", "Tambaram Bus Stand"],
    droppingPoints: ["Tambaram Bus Stand"] },
  { stopName: "Chengalpattu", stopId: "CGL", km: 60, min: 75,
    lat: 12.6921, lng: 79.9767,
    boardingPoints: ["Chengalpattu Toll Plaza", "Chengalpattu Bus Stand"],
    droppingPoints: ["Chengalpattu Bus Stand"] },
  { stopName: "Melmaruvathur", stopId: "MLMR", km: 96, min: 105,
    lat: 12.5286, lng: 79.9539,
    boardingPoints: ["Melmaruvathur Temple Arch"],
    droppingPoints: ["Melmaruvathur Bypass"] },
  { stopName: "Tindivanam", stopId: "TMV", km: 125, min: 140,
    lat: 12.2333, lng: 79.6667,
    boardingPoints: ["Tindivanam Bypass Junction"],
    droppingPoints: ["Tindivanam New Bus Stand"] },
  { stopName: "Villupuram", stopId: "VM", km: 163, min: 180,
    lat: 11.9401, lng: 79.4861,
    boardingPoints: ["Villupuram Bypass Toll"],
    droppingPoints: ["Villupuram Bus Stand"] },
  { stopName: "Puducherry", stopId: "PDY", km: 196, min: 235,
    lat: 11.9416, lng: 79.8083,
    boardingPoints: [],
    droppingPoints: ["Puducherry Main Bus Stand", "JIPMER Gorimedu", "ECR Junction"] },
];

function buildStops(startMinutes) {
  return FORWARD_STOPS.map((s, i) => {
    const dep = startMinutes + s.min;
    const arr = i === 0 ? dep : dep - 5;
    const fmt = (m) => `${String(Math.floor((m % 1440) / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    return {
      stopName: s.stopName,
      stopId: s.stopId,
      sequence: i + 1,
      departureTime: fmt(dep),
      arrivalTime: fmt(arr),
      distanceFromOrigin: s.km,
      latitude: s.lat,
      longitude: s.lng,
      boardingPoints: s.boardingPoints.length ? s.boardingPoints : [s.stopName],
      droppingPoints: s.droppingPoints.length ? s.droppingPoints : [s.stopName],
    };
  });
}

const REVERSE_ORDER = [...FORWARD_STOPS].reverse();

function buildReverseStops(startMinutes) {
  let running = 0;
  return REVERSE_ORDER.map((s, i) => {
    if (i > 0) running += s.km;
    const dep = startMinutes + Math.round(running / 196 * 235);
    const arr = i === 0 ? dep : dep - 5;
    const fmt = (m) => `${String(Math.floor((m % 1440) / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    return {
      stopName: s.stopName.replace("(Koyambedu CMBT)", "(Koyambedu CMBT)"),
      stopId: `${s.stopId}-R`,
      sequence: i + 1,
      departureTime: fmt(dep),
      arrivalTime: fmt(arr),
      distanceFromOrigin: running,
      latitude: s.lat,
      longitude: s.lng,
      boardingPoints: s.boardingPoints.length ? s.boardingPoints : [s.stopName],
      droppingPoints: s.droppingPoints.length ? s.droppingPoints : [s.stopName],
    };
  });
}

// ---------------------------------------------------------------------------
// Fare tiers
// ---------------------------------------------------------------------------
function makeFareConfig(pricePerKm) {
  return {
    baseFare: 40,
    pricePerKm,
    minimumFare: 60,
    taxPercent: 5,
    serviceFee: 10,
    busTypeMultipliers: new Map([
      ["standard", 1.0],
      ["sleeper", 1.8],
      ["A/C Seater", 1.5],
      ["A/C Sleeper", 2.0],
      ["Non-A/C", 0.9],
      ["volvo", 2.2],
      ["semi-sleeper", 1.3],
      ["luxury-sleeper", 1.9],
      ["multi-axle-ac", 2.1],
    ]),
    seatTypePremiums: new Map([
      ["regular", 0],
      ["window", 30],
      ["aisle", 20],
      ["lower-berth", 50],
      ["upper-berth", 30],
      ["sleeper", 100],
    ]),
    dynamicPricing: {
      enabled: true,
      thresholds: { lowOccupancy: 50, midOccupancy: 75, highOccupancy: 90 },
      surcharges: { low: 0, mid: 5, high: 10, peak: 15 },
      weekendMultiplier: 1.05,
      holidayMultiplier: 1.10,
    },
  };
}

// ---------------------------------------------------------------------------
// Schedules: 6 forward + 6 reverse. Each becomes ONE Route document.
// ---------------------------------------------------------------------------
const FORWARD_SCHEDULES = [
  { code: "F1", start: "05:45", tier: 1.8, label: "Early Morning" },
  { code: "F2", start: "07:30", tier: 2.2, label: "Morning Express" },
  { code: "F3", start: "09:15", tier: 2.8, label: "Midday A/C" },
  { code: "F4", start: "14:00", tier: 2.2, label: "Afternoon" },
  { code: "F5", start: "17:45", tier: 2.8, label: "Evening Premium", days: [0, 5, 6] },
  { code: "F6", start: "22:30", tier: 3.5, label: "Overnight Luxury" },
];

const REVERSE_SCHEDULES = [
  { code: "R1", start: "06:00", tier: 1.8, label: "Early Morning" },
  { code: "R2", start: "08:00", tier: 2.2, label: "Morning Express" },
  { code: "R3", start: "13:30", tier: 2.8, label: "Afternoon A/C" },
  { code: "R4", start: "16:45", tier: 2.2, label: "Evening" },
  { code: "R5", start: "19:30", tier: 2.8, label: "Night Premium", days: [1, 2, 3, 4, 5] },
  { code: "R6", start: "23:00", tier: 3.5, label: "Overnight Luxury" },
];

// ---------------------------------------------------------------------------
// Fleet
// ---------------------------------------------------------------------------
const AMENITIES = {
  economy: ["Water Bottle", "Charging Point", "Reading Light"],
  standard: ["Water Bottle", "Charging Point", "Blanket", "CCTV", "Emergency Exit"],
  premium: ["WiFi", "Water Bottle", "Charging Point", "Blanket", "Reading Light", "CCTV", "Live Tracking"],
  luxury: ["WiFi", "Water Bottle", "Charging Point", "Blanket", "Pillow", "Reading Light", "CCTV", "Snacks", "Live Tracking"],
};

function amenitiesFor(tier) {
  if (tier <= 1.8) return AMENITIES.economy;
  if (tier <= 2.2) return AMENITIES.standard;
  if (tier <= 2.8) return AMENITIES.premium;
  return AMENITIES.luxury;
}

const FLEET_FORWARD = [
  { op: "TNSTC Express", type: "Non-A/C", seats: 48, rating: 3.6, sched: "F1" },
  { op: "SETC Ultra Deluxe", type: "A/C Seater", seats: 44, rating: 4.0, sched: "F2" },
  { op: "KPN Travels", type: "semi-sleeper", seats: 40, rating: 4.1, sched: "F2" },
  { op: "Parveen Travels", type: "A/C Sleeper", seats: 36, rating: 4.4, sched: "F3" },
  { op: "Mettur Super Services", type: "standard", seats: 48, rating: 3.8, sched: "F4" },
  { op: "Kallada G4", type: "volvo", seats: 40, rating: 4.5, sched: "F5" },
  { op: "SRS Travels", type: "multi-axle-ac", seats: 44, rating: 4.3, sched: "F5" },
  { op: "Orange Tours", type: "luxury-sleeper", seats: 36, rating: 4.6, sched: "F6" },
  { op: "Parveen Travels", type: "A/C Sleeper", seats: 36, rating: 4.2, sched: "F6" },
  { op: "Sharma Transports", type: "sleeper", seats: 36, rating: 4.0, sched: "F6" },
  { op: "RKK Travels", type: "A/C Seater", seats: 44, rating: 4.1, sched: "F4" },
  { op: "JBT Travels", type: "semi-sleeper", seats: 40, rating: 3.9, sched: "F1" },
];

const FLEET_REVERSE = [
  { op: "TNSTC Express", type: "Non-A/C", seats: 48, rating: 3.5, sched: "R1" },
  { op: "SETC Ultra Deluxe", type: "A/C Seater", seats: 44, rating: 3.9, sched: "R2" },
  { op: "Kallada G4", type: "semi-sleeper", seats: 40, rating: 4.2, sched: "R2" },
  { op: "VRL Travels", type: "A/C Sleeper", seats: 36, rating: 4.4, sched: "R3" },
  { op: "Mettur Super Services", type: "standard", seats: 48, rating: 3.7, sched: "R4" },
  { op: "KPN Travels", type: "volvo", seats: 40, rating: 4.4, sched: "R5" },
  { op: "SRS Travels", type: "multi-axle-ac", seats: 44, rating: 4.2, sched: "R5" },
  { op: "Orange Tours", type: "luxury-sleeper", seats: 36, rating: 4.7, sched: "R6" },
  { op: "KPN Travels", type: "A/C Sleeper", seats: 36, rating: 4.3, sched: "R6" },
  { op: "Sharma Transports", type: "sleeper", seats: 36, rating: 4.1, sched: "R6" },
  { op: "RKK Travels", type: "A/C Seater", seats: 44, rating: 4.0, sched: "R4" },
  { op: "JBT Travels", type: "semi-sleeper", seats: 40, rating: 3.8, sched: "R1" },
];

function toMinutes(hhmm) {
  const [h, m] = String(hhmm).split(":").map(Number);
  return h * 60 + m;
}

async function seed() {
  try {
    const DBURL = process.env.MONGODB_URI;
    if (!DBURL) {
      console.error("MONGODB_URI not set.");
      process.exit(1);
    }
    await mongoose.connect(DBURL, { serverSelectionTimeoutMS: 15000 });
    console.log("[seed] Connected to MongoDB");

    // ---- Scoped cleanup: only this corridor's documents -------------------
    const oldRoutes = await Route.find({ routeName: new RegExp(CORRIDOR_TAG, "i") })
      .select("_id")
      .lean()
      .exec();
    const oldIds = oldRoutes.map((r) => r._id);
    if (oldIds.length) {
      const oldBuses = await Bus.find({ routes: { $in: oldIds } }).select("_id").lean().exec();
      const busIds = oldBuses.map((b) => b._id);
      if (busIds.length) {
        await SeatLock.deleteMany({ busId: { $in: busIds.map(String) } });
        await Booking.deleteMany({ busId: { $in: busIds } });
        await Bus.deleteMany({ _id: { $in: busIds } });
      }
      await Route.deleteMany({ _id: { $in: oldIds } });
      console.log(`[seed] Removed ${oldRoutes.length} old corridor routes and their buses`);
    }

    // ---- Global cancellation policy ---------------------------------------
    await CancellationPolicy.getGlobal();
    console.log("[seed] Global cancellation policy ensured");

    // ---- Routes ------------------------------------------------------------
    const routeByCode = {};

    for (const sch of FORWARD_SCHEDULES) {
      const startMin = toMinutes(sch.start);
      const stops = buildStops(startMin);
      const last = stops[stops.length - 1];
      const routeName = `Chennai → Puducherry ${sch.label} ${sch.start} | ${CORRIDOR_TAG}`;
      const doc = await Route.create({
        departureLocation: {
          name: "Chennai",
          subLocations: ["Koyambedu CMBT", "Tambaram", "Guindy", "Perungalathur"],
        },
        arrivalLocation: {
          name: "Puducherry",
          subLocations: ["Puducherry Main Bus Stand", "JIPMER Gorimedu", "Villupuram", "Tindivanam"],
        },
        duration: 235,
        stops,
        totalDistanceKm: 196,
        fareConfig: makeFareConfig(sch.tier),
        routeName,
      });
      routeByCode[sch.code] = doc;
      console.log(`[seed] Route ${routeName}`);
    }

    for (const sch of REVERSE_SCHEDULES) {
      const startMin = toMinutes(sch.start);
      const stops = buildReverseStops(startMin);
      const routeName = `Puducherry → Chennai ${sch.label} ${sch.start} | ${CORRIDOR_TAG}`;
      const doc = await Route.create({
        departureLocation: {
          name: "Puducherry",
          subLocations: ["Puducherry Main Bus Stand", "JIPMER Gorimedu", "Villupuram", "Tindivanam"],
        },
        arrivalLocation: {
          name: "Chennai",
          subLocations: ["Koyambedu CMBT", "Tambaram", "Guindy", "Perungalathur"],
        },
        duration: 235,
        stops,
        totalDistanceKm: 196,
        fareConfig: makeFareConfig(sch.tier),
        routeName,
      });
      routeByCode[sch.code] = doc;
      console.log(`[seed] Route ${routeName}`);
    }

    // ---- Buses -------------------------------------------------------------
    let imgCounter = 0;
    async function plantBus(fleetItem, direction) {
      const route = routeByCode[fleetItem.sched];
      const firstStop = route.stops[0];
      const lastStop = route.stops[route.stops.length - 1];
      const rows = fleetItem.seats / 4;
      imgCounter += 1;

      const regLetters = "ABCDEFGHJKLMNPRSTUVWXYZ";
      const rnd = (n) => Math.floor(Math.random() * n);
      const busNumber = `TN-${String(1 + rnd(38)).padStart(2, "0")}${regLetters[rnd(regLetters.length)]}${regLetters[rnd(regLetters.length)]}-${String(1000 + rnd(9000))}`;

      const bus = await Bus.create({
        operatorName: fleetItem.op,
        busNumber,
        busType: fleetItem.type,
        departureTime: firstStop.departureTime,
        arrivalTime: lastStop.arrivalTime,
        amenities: amenitiesFor(route.fareConfig.pricePerKm),
        rating: [
          Math.round(fleetItem.rating * 10) / 10,
          Math.round(Math.max(1, fleetItem.rating - 0.4) * 10) / 10,
          Math.round(Math.min(5, fleetItem.rating + 0.3) * 10) / 10,
        ],
        totalSeats: fleetItem.seats,
        routes: route._id,
        images: `https://picsum.photos/seed/tedbus${imgCounter}/640/360`,
        liveTracking: route.fareConfig.pricePerKm >= 2.2 ? 1 : 0,
        reschedulable: fleetItem.rating >= 4 ? 1 : 0,
        operatingDays:
          route.routeName.includes("F5") || route.routeName.includes("R5")
            ? undefined // handled below via schedule days
            : [0, 1, 2, 3, 4, 5, 6],
        seatLayout: { seatsPerRow: 4, totalRows: rows },
      });

      // Schedule-specific operating days override
      const sched =
        direction === "forward"
          ? FORWARD_SCHEDULES.find((s) => s.code === fleetItem.sched)
          : REVERSE_SCHEDULES.find((s) => s.code === fleetItem.sched);
      if (sched && sched.days) {
        bus.operatingDays = sched.days;
        await bus.save();
      }

      console.log(`[seed]   Bus ${fleetItem.op} (${fleetItem.type}, ${fleetItem.seats} seats) on ${fleetItem.sched}`);
      return bus;
    }

    for (const item of FLEET_FORWARD) await plantBus(item, "forward");
    for (const item of FLEET_REVERSE) await plantBus(item, "reverse");

    const counts = {
      corridorRoutes: await Route.countDocuments({ routeName: new RegExp(CORRIDOR_TAG, "i") }),
      corridorBuses: await Bus.countDocuments({
        routes: { $in: (await Route.find({ routeName: new RegExp(CORRIDOR_TAG, "i") }).select("_id")).map((r) => r._id) },
      }),
    };
    console.log("[seed] DONE:", JSON.stringify(counts));
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error("[seed] FAILED:", err);
    process.exit(1);
  }
}

seed();
