/**
 * Comprehensive seed script for TedBus.
 *
 * Creates 10 Indian bus routes with 12 buses, sample bookings and seat locks.
 *
 * Usage:
 *   cd frontend/server
 *   node scripts/seed-complete-data.js
 *
 * Requires MONGODB_URI in .env
 */
const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const Route = require("../models/route");
const Bus = require("../models/bus");
const Booking = require("../models/booking");
const SeatLock = require("../models/seatLock");

function makeFareConfig(baseFare, pricePerKm, minimumFare) {
  return {
    baseFare,
    pricePerKm,
    minimumFare,
    taxPercent: 5,
    serviceFee: 12,
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

function generateDates(daysAhead) {
  const dates = [];
  const now = new Date();
  for (let i = 0; i < daysAhead; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    dates.push(d.toISOString().split("T")[0]);
  }
  return dates;
}

async function seed() {
  try {
    const DBURL = process.env.MONGODB_URI;
    if (!DBURL) {
      console.error("MONGODB_URI not set. Copy .env.example to .env and fill it in.");
      process.exit(1);
    }
    await mongoose.connect(DBURL, { serverSelectionTimeoutMS: 10000 });
    console.log("Connected to MongoDB");

    await Route.deleteMany({});
    await Bus.deleteMany({});
    await Booking.deleteMany({});
    await SeatLock.deleteMany({});
    console.log("Cleared existing Routes, Buses, Bookings, and SeatLocks");

    // ──────────────────────────────────────────────
    //  ROUTES
    // ──────────────────────────────────────────────

    // Route 1: Chennai → Bangalore (via Vellore, Krishnagiri) — 350 km, 7 h
    const route1 = await Route.create({
      routeName: "Chennai to Bangalore via Vellore",
      departureLocation: { name: "Chennai", subLocations: ["Koyambedu", "CMBT", "T. Nagar"] },
      arrivalLocation: { name: "Bangalore", subLocations: ["Majestic", "Hebbal", "Silk Board"] },
      duration: 7,
      totalDistanceKm: 350,
      stops: [
        {
          stopName: "Chennai", stopId: "chennai-001", sequence: 1,
          departureTime: "08:00", arrivalTime: "08:00", distanceFromOrigin: 0,
          latitude: 13.0827, longitude: 80.2707,
          boardingPoints: ["Koyambedu Bus Terminal", "CMBT", "T. Nagar Bus Depot"],
          droppingPoints: ["Koyambedu Bus Terminal", "CMBT", "T. Nagar Bus Depot"],
        },
        {
          stopName: "Vellore", stopId: "vellore-002", sequence: 2,
          departureTime: "09:30", arrivalTime: "09:20", distanceFromOrigin: 140,
          latitude: 12.9165, longitude: 79.1325,
          boardingPoints: ["Vellore Bus Stand", "Gandhi Road Junction"],
          droppingPoints: ["Vellore Bus Stand", "Gandhi Road Junction"],
        },
        {
          stopName: "Krishnagiri", stopId: "krishnagiri-003", sequence: 3,
          departureTime: "11:00", arrivalTime: "10:50", distanceFromOrigin: 260,
          latitude: 12.5186, longitude: 78.2137,
          boardingPoints: ["Krishnagiri Bus Stand"],
          droppingPoints: ["Krishnagiri Bus Stand"],
        },
        {
          stopName: "Bangalore", stopId: "bangalore-004", sequence: 4,
          departureTime: "15:00", arrivalTime: "15:00", distanceFromOrigin: 350,
          latitude: 12.9716, longitude: 77.5946,
          boardingPoints: ["Majestic Bus Station", "Silk Board Junction"],
          droppingPoints: ["Majestic Bus Station", "Hebbal Bus Stand"],
        },
      ],
      fareConfig: makeFareConfig(250, 1.8, 280),
      isActive: true,
    });

    // Route 2: Chennai → Madurai (via Villupuram, Trichy) — 460 km, 8 h
    const route2 = await Route.create({
      routeName: "Chennai to Madurai via Villupuram and Trichy",
      departureLocation: { name: "Chennai", subLocations: ["Koyambedu", "CMBT"] },
      arrivalLocation: { name: "Madurai", subLocations: ["Mattuthavani", "Periyar Bus Stand"] },
      duration: 8,
      totalDistanceKm: 460,
      stops: [
        {
          stopName: "Chennai", stopId: "chennai-001", sequence: 1,
          departureTime: "09:00", arrivalTime: "09:00", distanceFromOrigin: 0,
          latitude: 13.0827, longitude: 80.2707,
          boardingPoints: ["Koyambedu Bus Terminal", "CMBT"],
          droppingPoints: ["Koyambedu Bus Terminal", "CMBT"],
        },
        {
          stopName: "Villupuram", stopId: "villupuram-002", sequence: 2,
          departureTime: "11:30", arrivalTime: "11:20", distanceFromOrigin: 160,
          latitude: 11.9400, longitude: 79.4900,
          boardingPoints: ["Villupuram Bus Stand"],
          droppingPoints: ["Villupuram Bus Stand"],
        },
        {
          stopName: "Trichy", stopId: "trichy-003", sequence: 3,
          departureTime: "13:30", arrivalTime: "13:20", distanceFromOrigin: 330,
          latitude: 10.7905, longitude: 78.7047,
          boardingPoints: ["Trichy Central Bus Stand", "Chatram Bus Stand"],
          droppingPoints: ["Trichy Central Bus Stand", "Chatram Bus Stand"],
        },
        {
          stopName: "Madurai", stopId: "madurai-004", sequence: 4,
          departureTime: "17:00", arrivalTime: "17:00", distanceFromOrigin: 460,
          latitude: 9.9252, longitude: 78.1198,
          boardingPoints: ["Mattuthavani Bus Terminal", "Periyar Bus Stand"],
          droppingPoints: ["Mattuthavani Bus Terminal", "Periyar Bus Stand"],
        },
      ],
      fareConfig: makeFareConfig(300, 1.6, 350),
      isActive: true,
    });

    // Route 3: Chennai → Coimbatore (via Salem) — 510 km, 9 h
    const route3 = await Route.create({
      routeName: "Chennai to Coimbatore via Salem",
      departureLocation: { name: "Chennai", subLocations: ["Koyambedu", "CMBT"] },
      arrivalLocation: { name: "Coimbatore", subLocations: ["Gandhipuram", "Town Bus Stand"] },
      duration: 9,
      totalDistanceKm: 510,
      stops: [
        {
          stopName: "Chennai", stopId: "chennai-001", sequence: 1,
          departureTime: "21:00", arrivalTime: "21:00", distanceFromOrigin: 0,
          latitude: 13.0827, longitude: 80.2707,
          boardingPoints: ["Koyambedu Bus Terminal", "CMBT"],
          droppingPoints: ["Koyambedu Bus Terminal", "CMBT"],
        },
        {
          stopName: "Salem", stopId: "salem-002", sequence: 2,
          departureTime: "01:00", arrivalTime: "00:50", distanceFromOrigin: 340,
          latitude: 11.6643, longitude: 78.1460,
          boardingPoints: ["Salem Bus Stand"],
          droppingPoints: ["Salem Bus Stand"],
        },
        {
          stopName: "Coimbatore", stopId: "coimbatore-003", sequence: 3,
          departureTime: "06:00", arrivalTime: "06:00", distanceFromOrigin: 510,
          latitude: 11.0168, longitude: 76.9558,
          boardingPoints: ["Gandhipuram Bus Stand", "Coimbatore Town Bus Stand"],
          droppingPoints: ["Gandhipuram Bus Stand", "Coimbatore Town Bus Stand"],
        },
      ],
      fareConfig: makeFareConfig(350, 1.7, 380),
      isActive: true,
    });

    // Route 4: Bangalore → Chennai (via Krishnagiri, Vellore) — 350 km, 7 h
    const route4 = await Route.create({
      routeName: "Bangalore to Chennai via Krishnagiri",
      departureLocation: { name: "Bangalore", subLocations: ["Majestic", "Hebbal", "Silk Board"] },
      arrivalLocation: { name: "Chennai", subLocations: ["Koyambedu", "CMBT", "T. Nagar"] },
      duration: 7,
      totalDistanceKm: 350,
      stops: [
        {
          stopName: "Bangalore", stopId: "bangalore-004", sequence: 1,
          departureTime: "07:00", arrivalTime: "07:00", distanceFromOrigin: 0,
          latitude: 12.9716, longitude: 77.5946,
          boardingPoints: ["Majestic Bus Station", "Hebbal Bus Stand", "Silk Board Junction"],
          droppingPoints: ["Majestic Bus Station", "Hebbal Bus Stand", "Silk Board Junction"],
        },
        {
          stopName: "Krishnagiri", stopId: "krishnagiri-003", sequence: 2,
          departureTime: "09:30", arrivalTime: "09:20", distanceFromOrigin: 90,
          latitude: 12.5186, longitude: 78.2137,
          boardingPoints: ["Krishnagiri Bus Stand"],
          droppingPoints: ["Krishnagiri Bus Stand"],
        },
        {
          stopName: "Vellore", stopId: "vellore-002", sequence: 3,
          departureTime: "11:00", arrivalTime: "10:50", distanceFromOrigin: 210,
          latitude: 12.9165, longitude: 79.1325,
          boardingPoints: ["Vellore Bus Stand"],
          droppingPoints: ["Vellore Bus Stand"],
        },
        {
          stopName: "Chennai", stopId: "chennai-001", sequence: 4,
          departureTime: "14:00", arrivalTime: "14:00", distanceFromOrigin: 350,
          latitude: 13.0827, longitude: 80.2707,
          boardingPoints: ["Koyambedu Bus Terminal", "CMBT"],
          droppingPoints: ["Koyambedu Bus Terminal", "CMBT"],
        },
      ],
      fareConfig: makeFareConfig(250, 1.8, 280),
      isActive: true,
    });

    // Route 5: Bangalore → Mysore (via Ramanagara) — 150 km, 3 h
    const route5 = await Route.create({
      routeName: "Bangalore to Mysore via Ramanagara",
      departureLocation: { name: "Bangalore", subLocations: ["Majestic", "Satellite Bus Stand"] },
      arrivalLocation: { name: "Mysore", subLocations: ["Mysore Bus Stand", "Hunsur Road"] },
      duration: 3,
      totalDistanceKm: 150,
      stops: [
        {
          stopName: "Bangalore", stopId: "bangalore-004", sequence: 1,
          departureTime: "06:00", arrivalTime: "06:00", distanceFromOrigin: 0,
          latitude: 12.9716, longitude: 77.5946,
          boardingPoints: ["Majestic Bus Station", "Satellite Bus Stand"],
          droppingPoints: ["Majestic Bus Station", "Satellite Bus Stand"],
        },
        {
          stopName: "Ramanagara", stopId: "ramanagara-002", sequence: 2,
          departureTime: "06:50", arrivalTime: "06:45", distanceFromOrigin: 50,
          latitude: 12.7220, longitude: 77.2810,
          boardingPoints: ["Ramanagara Bus Stand"],
          droppingPoints: ["Ramanagara Bus Stand"],
        },
        {
          stopName: "Mysore", stopId: "mysore-003", sequence: 3,
          departureTime: "09:00", arrivalTime: "09:00", distanceFromOrigin: 150,
          latitude: 12.2958, longitude: 76.6394,
          boardingPoints: ["Mysore Bus Stand", "Hunsur Road Bus Stop"],
          droppingPoints: ["Mysore Bus Stand", "Hunsur Road Bus Stop"],
        },
      ],
      fareConfig: makeFareConfig(120, 1.5, 150),
      isActive: true,
    });

    // Route 6: Chennai → Pondicherry (via GST Road) — 150 km, 3.5 h
    const route6 = await Route.create({
      routeName: "Chennai to Pondicherry via GST Road",
      departureLocation: { name: "Chennai", subLocations: ["Tambaram", "Adyar", "CMBT"] },
      arrivalLocation: { name: "Pondicherry", subLocations: ["Pondicherry Bus Stand", "NEET Bus Stand"] },
      duration: 3.5,
      totalDistanceKm: 150,
      stops: [
        {
          stopName: "Chennai", stopId: "chennai-001", sequence: 1,
          departureTime: "07:30", arrivalTime: "07:30", distanceFromOrigin: 0,
          latitude: 13.0827, longitude: 80.2707,
          boardingPoints: ["Tambaram Bus Stand", "Adyar Bus Depot", "CMBT"],
          droppingPoints: ["Tambaram Bus Stand", "Adyar Bus Depot", "CMBT"],
        },
        {
          stopName: "Mahabalipuram", stopId: "mahabalipuram-002", sequence: 2,
          departureTime: "08:30", arrivalTime: "08:25", distanceFromOrigin: 60,
          latitude: 12.6166, longitude: 80.1992,
          boardingPoints: ["Mahabalipuram Bus Stop"],
          droppingPoints: ["Mahabalipuram Bus Stop"],
        },
        {
          stopName: "Pondicherry", stopId: "pondicherry-003", sequence: 3,
          departureTime: "11:00", arrivalTime: "11:00", distanceFromOrigin: 150,
          latitude: 11.9416, longitude: 79.8083,
          boardingPoints: ["Pondicherry Bus Stand", "NEET Bus Stand"],
          droppingPoints: ["Pondicherry Bus Stand", "NEET Bus Stand"],
        },
      ],
      fareConfig: makeFareConfig(100, 1.5, 120),
      isActive: true,
    });

    // Route 7: Chennai → Trichy (via Villupuram) — 330 km, 6 h
    const route7 = await Route.create({
      routeName: "Chennai to Trichy via Villupuram",
      departureLocation: { name: "Chennai", subLocations: ["Koyambedu", "CMBT"] },
      arrivalLocation: { name: "Trichy", subLocations: ["Central Bus Stand", "Chatram"] },
      duration: 6,
      totalDistanceKm: 330,
      stops: [
        {
          stopName: "Chennai", stopId: "chennai-001", sequence: 1,
          departureTime: "20:00", arrivalTime: "20:00", distanceFromOrigin: 0,
          latitude: 13.0827, longitude: 80.2707,
          boardingPoints: ["Koyambedu Bus Terminal", "CMBT"],
          droppingPoints: ["Koyambedu Bus Terminal", "CMBT"],
        },
        {
          stopName: "Villupuram", stopId: "villupuram-002", sequence: 2,
          departureTime: "22:30", arrivalTime: "22:20", distanceFromOrigin: 160,
          latitude: 11.9400, longitude: 79.4900,
          boardingPoints: ["Villupuram Bus Stand"],
          droppingPoints: ["Villupuram Bus Stand"],
        },
        {
          stopName: "Trichy", stopId: "trichy-003", sequence: 3,
          departureTime: "02:00", arrivalTime: "02:00", distanceFromOrigin: 330,
          latitude: 10.7905, longitude: 78.7047,
          boardingPoints: ["Trichy Central Bus Stand", "Chatram Bus Stand"],
          droppingPoints: ["Trichy Central Bus Stand", "Chatram Bus Stand"],
        },
      ],
      fareConfig: makeFareConfig(220, 1.6, 250),
      isActive: true,
    });

    // Route 8: Coimbatore → Bangalore (via Salem, Hosur) — 370 km, 7 h
    const route8 = await Route.create({
      routeName: "Coimbatore to Bangalore via Salem and Hosur",
      departureLocation: { name: "Coimbatore", subLocations: ["Gandhipuram", "Town Bus Stand"] },
      arrivalLocation: { name: "Bangalore", subLocations: ["Majestic", "Hebbal"] },
      duration: 7,
      totalDistanceKm: 370,
      stops: [
        {
          stopName: "Coimbatore", stopId: "coimbatore-003", sequence: 1,
          departureTime: "22:30", arrivalTime: "22:30", distanceFromOrigin: 0,
          latitude: 11.0168, longitude: 76.9558,
          boardingPoints: ["Gandhipuram Bus Stand", "Coimbatore Town Bus Stand"],
          droppingPoints: ["Gandhipuram Bus Stand", "Coimbatore Town Bus Stand"],
        },
        {
          stopName: "Salem", stopId: "salem-002", sequence: 2,
          departureTime: "00:30", arrivalTime: "00:20", distanceFromOrigin: 170,
          latitude: 11.6643, longitude: 78.1460,
          boardingPoints: ["Salem Bus Stand"],
          droppingPoints: ["Salem Bus Stand"],
        },
        {
          stopName: "Hosur", stopId: "hosur-003", sequence: 3,
          departureTime: "02:30", arrivalTime: "02:20", distanceFromOrigin: 310,
          latitude: 12.7353, longitude: 77.8254,
          boardingPoints: ["Hosur Bus Stand"],
          droppingPoints: ["Hosur Bus Stand"],
        },
        {
          stopName: "Bangalore", stopId: "bangalore-004", sequence: 4,
          departureTime: "05:30", arrivalTime: "05:30", distanceFromOrigin: 370,
          latitude: 12.9716, longitude: 77.5946,
          boardingPoints: ["Majestic Bus Station", "Hebbal Bus Stand"],
          droppingPoints: ["Majestic Bus Station", "Hebbal Bus Stand"],
        },
      ],
      fareConfig: makeFareConfig(280, 1.7, 300),
      isActive: true,
    });

    // Route 9: Madurai → Chennai (via Dindigul, Salem) — 460 km, 8 h
    const route9 = await Route.create({
      routeName: "Madurai to Chennai via Dindigul and Salem",
      departureLocation: { name: "Madurai", subLocations: ["Mattuthavani", "Periyar Bus Stand"] },
      arrivalLocation: { name: "Chennai", subLocations: ["Koyambedu", "CMBT"] },
      duration: 8,
      totalDistanceKm: 460,
      stops: [
        {
          stopName: "Madurai", stopId: "madurai-004", sequence: 1,
          departureTime: "21:00", arrivalTime: "21:00", distanceFromOrigin: 0,
          latitude: 9.9252, longitude: 78.1198,
          boardingPoints: ["Mattuthavani Bus Terminal", "Periyar Bus Stand"],
          droppingPoints: ["Mattuthavani Bus Terminal", "Periyar Bus Stand"],
        },
        {
          stopName: "Dindigul", stopId: "dindigul-002", sequence: 2,
          departureTime: "22:00", arrivalTime: "21:55", distanceFromOrigin: 65,
          latitude: 10.3470, longitude: 77.9540,
          boardingPoints: ["Dindigul Bus Stand"],
          droppingPoints: ["Dindigul Bus Stand"],
        },
        {
          stopName: "Salem", stopId: "salem-002", sequence: 3,
          departureTime: "01:30", arrivalTime: "01:20", distanceFromOrigin: 230,
          latitude: 11.6643, longitude: 78.1460,
          boardingPoints: ["Salem Bus Stand"],
          droppingPoints: ["Salem Bus Stand"],
        },
        {
          stopName: "Chennai", stopId: "chennai-001", sequence: 4,
          departureTime: "05:00", arrivalTime: "05:00", distanceFromOrigin: 460,
          latitude: 13.0827, longitude: 80.2707,
          boardingPoints: ["Koyambedu Bus Terminal", "CMBT"],
          droppingPoints: ["Koyambedu Bus Terminal", "CMBT"],
        },
      ],
      fareConfig: makeFareConfig(300, 1.6, 350),
      isActive: true,
    });

    // Route 10: Bangalore → Hyderabad (via Anantapur) — 570 km, 10 h
    const route10 = await Route.create({
      routeName: "Bangalore to Hyderabad via Anantapur",
      departureLocation: { name: "Bangalore", subLocations: ["Majestic", "Hebbal", "Electronic City"] },
      arrivalLocation: { name: "Hyderabad", subLocations: ["MGBS", "JBS", "Ameerpet"] },
      duration: 10,
      totalDistanceKm: 570,
      stops: [
        {
          stopName: "Bangalore", stopId: "bangalore-004", sequence: 1,
          departureTime: "20:00", arrivalTime: "20:00", distanceFromOrigin: 0,
          latitude: 12.9716, longitude: 77.5946,
          boardingPoints: ["Majestic Bus Station", "Hebbal Bus Stand", "Electronic City"],
          droppingPoints: ["Majestic Bus Station", "Hebbal Bus Stand", "Electronic City"],
        },
        {
          stopName: "Anantapur", stopId: "anantapur-002", sequence: 2,
          departureTime: "00:30", arrivalTime: "00:20", distanceFromOrigin: 250,
          latitude: 14.6819, longitude: 77.5874,
          boardingPoints: ["Anantapur Bus Stand"],
          droppingPoints: ["Anantapur Bus Stand"],
        },
        {
          stopName: "Kurnool", stopId: "kurnool-003", sequence: 3,
          departureTime: "02:30", arrivalTime: "02:20", distanceFromOrigin: 400,
          latitude: 15.8281, longitude: 78.0373,
          boardingPoints: ["Kurnool Bus Stand"],
          droppingPoints: ["Kurnool Bus Stand"],
        },
        {
          stopName: "Hyderabad", stopId: "hyderabad-004", sequence: 4,
          departureTime: "06:00", arrivalTime: "06:00", distanceFromOrigin: 570,
          latitude: 17.3850, longitude: 78.4867,
          boardingPoints: ["MGBS (Mahatma Gandhi Bus Station)", "JBS (Jubilee Bus Stand)", "Ameerpet"],
          droppingPoints: ["MGBS (Mahatma Gandhi Bus Station)", "JBS (Jubilee Bus Stand)", "Ameerpet"],
        },
      ],
      fareConfig: makeFareConfig(400, 2.0, 450),
      isActive: true,
    });

    console.log("Created 10 routes");

    // ──────────────────────────────────────────────
    //  BUSES
    // ──────────────────────────────────────────────

    const allBuses = [
      // Bus 1: KPN Travels — A/C Seater — Chennai→Bangalore — 08:00
      {
        operatorName: "KPN Travels",
        busType: "A/C Seater",
        departureTime: "08:00",
        totalSeats: 40,
        images: "/images/buses/kpn-ac-seater.jpg",
        liveTracking: 1,
        reschedulable: 1,
        rating: [4.3, 4.5, 4.2, 4.4, 4.1, 4.6],
        routes: route1._id,
        operatingDays: [0, 1, 2, 3, 4, 5, 6],
        seatLayout: { seatsPerRow: 4, totalRows: 10, seatTypes: new Map([["regular", [1, 2, 3, 4]], ["window", [1, 4]]]) },
      },
      // Bus 2: SRS Travels — sleeper — Chennai→Bangalore — 22:00
      {
        operatorName: "SRS Travels",
        busType: "sleeper",
        departureTime: "22:00",
        totalSeats: 36,
        images: "/images/buses/srs-sleeper.jpg",
        liveTracking: 1,
        reschedulable: 0,
        rating: [4.5, 4.6, 4.4, 4.7],
        routes: route1._id,
        operatingDays: [0, 1, 2, 3, 4, 5, 6],
        seatLayout: { seatsPerRow: 3, totalRows: 12, seatTypes: new Map([["lower-berth", [1]], ["upper-berth", [2]], ["sleeper", [3]]]) },
      },
      // Bus 3: VRL Travels — standard — Chennai→Madurai — 09:00
      {
        operatorName: "VRL Travels",
        busType: "standard",
        departureTime: "09:00",
        totalSeats: 45,
        images: "/images/buses/vrl-standard.jpg",
        liveTracking: 0,
        reschedulable: 0,
        rating: [3.9, 4.1, 4.0, 3.8, 4.2],
        routes: route2._id,
        operatingDays: [1, 2, 3, 4, 5],
        seatLayout: { seatsPerRow: 4, totalRows: 11, seatTypes: new Map([["regular", [1, 2, 3, 4]], ["window", [1, 4]]]) },
      },
      // Bus 4: KSRTC — A/C Sleeper — Chennai→Coimbatore — 21:00
      {
        operatorName: "KSRTC",
        busType: "A/C Sleeper",
        departureTime: "21:00",
        totalSeats: 30,
        images: "/images/buses/ksrtc-ac-sleeper.jpg",
        liveTracking: 1,
        reschedulable: 1,
        rating: [4.6, 4.7, 4.5, 4.8, 4.3],
        routes: route3._id,
        operatingDays: [0, 1, 2, 3, 4, 5, 6],
        seatLayout: { seatsPerRow: 3, totalRows: 10, seatTypes: new Map([["lower-berth", [1]], ["upper-berth", [2]], ["sleeper", [3]]]) },
      },
      // Bus 5: Paulo Travels — volvo — Bangalore→Chennai — 07:00
      {
        operatorName: "Paulo Travels",
        busType: "volvo",
        departureTime: "07:00",
        totalSeats: 40,
        images: "/images/buses/paulo-volvo.jpg",
        liveTracking: 1,
        reschedulable: 1,
        rating: [4.4, 4.3, 4.5, 4.6, 4.2, 4.7, 4.1],
        routes: route4._id,
        operatingDays: [0, 1, 2, 3, 4, 5, 6],
        seatLayout: { seatsPerRow: 4, totalRows: 10, seatTypes: new Map([["regular", [1, 2, 3, 4]], ["window", [1, 4]], ["aisle", [2, 3]]]) },
      },
      // Bus 6: Neeta Travels — standard — Bangalore→Mysore — 06:00
      {
        operatorName: "Neeta Travels",
        busType: "standard",
        departureTime: "06:00",
        totalSeats: 42,
        images: "/images/buses/neeta-standard.jpg",
        liveTracking: 0,
        reschedulable: 0,
        rating: [3.9, 4.0, 3.7, 4.1, 3.8],
        routes: route5._id,
        operatingDays: [0, 1, 2, 3, 4, 5, 6],
        seatLayout: { seatsPerRow: 4, totalRows: 11, seatTypes: new Map([["regular", [1, 2, 3, 4]], ["window", [1, 4]]]) },
      },
      // Bus 7: Parveen Travels — A/C Seater — Chennai→Pondicherry — 07:30
      {
        operatorName: "Parveen Travels",
        busType: "A/C Seater",
        departureTime: "07:30",
        totalSeats: 35,
        images: "/images/buses/parveen-ac-seater.jpg",
        liveTracking: 1,
        reschedulable: 1,
        rating: [4.2, 4.4, 4.1, 4.3, 4.5],
        routes: route6._id,
        operatingDays: [0, 1, 2, 3, 4, 5, 6],
        seatLayout: { seatsPerRow: 4, totalRows: 9, seatTypes: new Map([["regular", [1, 2, 3, 4]], ["window", [1, 4]]]) },
      },
      // Bus 8: SRM Travels — semi-sleeper — Chennai→Trichy — 20:00
      {
        operatorName: "SRM Travels",
        busType: "semi-sleeper",
        departureTime: "20:00",
        totalSeats: 38,
        images: "/images/buses/srm-semi-sleeper.jpg",
        liveTracking: 0,
        reschedulable: 1,
        rating: [4.0, 4.2, 3.9, 4.1, 4.3, 3.8],
        routes: route7._id,
        operatingDays: [0, 1, 2, 3, 4, 5, 6],
        seatLayout: { seatsPerRow: 4, totalRows: 10, seatTypes: new Map([["regular", [1, 2, 3, 4]], ["window", [1, 4]], ["aisle", [2, 3]]]) },
      },
      // Bus 9: Bharat Express — luxury-sleeper — Coimbatore→Bangalore — 22:30
      {
        operatorName: "Bharat Express",
        busType: "luxury-sleeper",
        departureTime: "22:30",
        totalSeats: 28,
        images: "/images/buses/bharat-luxury-sleeper.jpg",
        liveTracking: 1,
        reschedulable: 0,
        rating: [4.5, 4.7, 4.3, 4.6, 4.8, 4.4, 4.9, 4.2],
        routes: route8._id,
        operatingDays: [0, 2, 4, 6],
        seatLayout: { seatsPerRow: 3, totalRows: 10, seatTypes: new Map([["lower-berth", [1]], ["upper-berth", [2]], ["sleeper", [3]]]) },
      },
      // Bus 10: Kallada Travels — A/C Sleeper — Madurai→Chennai — 21:00
      {
        operatorName: "Kallada Travels",
        busType: "A/C Sleeper",
        departureTime: "21:00",
        totalSeats: 32,
        images: "/images/buses/kallada-ac-sleeper.jpg",
        liveTracking: 1,
        reschedulable: 1,
        rating: [4.4, 4.6, 4.3, 4.5, 4.2],
        routes: route9._id,
        operatingDays: [0, 1, 2, 3, 4, 5, 6],
        seatLayout: { seatsPerRow: 3, totalRows: 11, seatTypes: new Map([["lower-berth", [1]], ["upper-berth", [2]], ["sleeper", [3]]]) },
      },
      // Bus 11: GreenLine Travels — standard — Bangalore→Hyderabad — 20:00
      {
        operatorName: "GreenLine Travels",
        busType: "standard",
        departureTime: "20:00",
        totalSeats: 44,
        images: "/images/buses/greenline-standard.jpg",
        liveTracking: 0,
        reschedulable: 0,
        rating: [3.5, 3.8, 3.6, 3.9, 3.7, 4.0, 3.4],
        routes: route10._id,
        operatingDays: [0, 1, 2, 3, 4, 5, 6],
        seatLayout: { seatsPerRow: 4, totalRows: 11, seatTypes: new Map([["regular", [1, 2, 3, 4]], ["window", [1, 4]]]) },
      },
      // Bus 12: Dhanunjaya Travels — multi-axle-ac — Chennai→Madurai — 22:30
      {
        operatorName: "Dhanunjaya Travels",
        busType: "multi-axle-ac",
        departureTime: "22:30",
        totalSeats: 36,
        images: "/images/buses/dhanunjaya-multi-axle.jpg",
        liveTracking: 1,
        reschedulable: 1,
        rating: [4.3, 4.5, 4.2, 4.4, 4.6, 4.1],
        routes: route2._id,
        operatingDays: [0, 1, 2, 3, 4, 5, 6],
        seatLayout: { seatsPerRow: 4, totalRows: 9, seatTypes: new Map([["regular", [1, 2, 3, 4]], ["window", [1, 4]], ["aisle", [2, 3]]]) },
      },
    ];

    const savedBuses = [];
    for (const b of allBuses) {
      const bus = await Bus.create(b);
      savedBuses.push(bus);
      console.log(`  Bus: ${bus.operatorName} (${bus.busType}) → Route`);
    }

    console.log(`Created ${savedBuses.length} buses`);

    // ──────────────────────────────────────────────
    //  SAMPLE BOOKINGS
    // ──────────────────────────────────────────────

    const futureDates = generateDates(14);
    const passengerNames = [
      { name: "Rajesh Kumar", gender: "M", age: 32 },
      { name: "Priya Sharma", gender: "F", age: 28 },
      { name: "Amit Singh", gender: "M", age: 35 },
      { name: "Sneha Patel", gender: "F", age: 26 },
      { name: "Vikram Rao", gender: "M", age: 40 },
      { name: "Ananya Das", gender: "F", age: 30 },
      { name: "Karthik Menon", gender: "M", age: 29 },
      { name: "Deepa Nair", gender: "F", age: 34 },
    ];

    const sampleBookings = [
      {
        customerId: "cust-seed-001",
        passengerDetails: [passengerNames[0]],
        email: "rajesh@example.com",
        phoneNumber: "9876543210",
        fare: 650,
        status: "ticket_confirmed",
        bookingDate: futureDates[1],
        busId: String(savedBuses[0]._id),
        seats: [3, 4],
        departureDetails: { city: "Chennai", time: 8, date: futureDates[1] },
        arrivalDetails: { city: "Bangalore", time: "15:00", date: futureDates[1] },
        duration: "7h 0m",
        boardingStopSequence: 1,
        droppingStopSequence: 4,
        boardingStopName: "Chennai - Koyambedu Bus Terminal",
        droppingStopName: "Bangalore - Majestic Bus Station",
        segmentDistanceKm: 350,
        journeyDate: futureDates[1],
        busDetails: { operatorName: "KPN Travels", busType: "A/C Seater", image: "/images/buses/kpn-ac-seater.jpg", departureTime: "08:00" },
        paymentStatus: "verified",
        timeline: [
          { status: "booked", at: new Date() },
          { status: "payment_verified", at: new Date() },
          { status: "ticket_confirmed", at: new Date() },
        ],
      },
      {
        customerId: "cust-seed-002",
        passengerDetails: [passengerNames[1], passengerNames[2]],
        email: "priya@example.com",
        phoneNumber: "9876543211",
        fare: 1200,
        status: "ticket_confirmed",
        bookingDate: futureDates[2],
        busId: String(savedBuses[1]._id),
        seats: [10, 11],
        departureDetails: { city: "Chennai", time: 22, date: futureDates[2] },
        arrivalDetails: { city: "Bangalore", time: "05:00", date: futureDates[3] },
        duration: "7h 0m",
        boardingStopSequence: 1,
        droppingStopSequence: 4,
        boardingStopName: "Chennai - Koyambedu Bus Terminal",
        droppingStopName: "Bangalore - Majestic Bus Station",
        segmentDistanceKm: 350,
        journeyDate: futureDates[2],
        busDetails: { operatorName: "SRS Travels", busType: "sleeper", image: "/images/buses/srs-sleeper.jpg", departureTime: "22:00" },
        paymentStatus: "verified",
        timeline: [
          { status: "booked", at: new Date() },
          { status: "payment_verified", at: new Date() },
          { status: "ticket_confirmed", at: new Date() },
        ],
      },
      {
        customerId: "cust-seed-003",
        passengerDetails: [passengerNames[3]],
        email: "sneha@example.com",
        phoneNumber: "9876543212",
        fare: 450,
        status: "ticket_confirmed",
        bookingDate: futureDates[0],
        busId: String(savedBuses[5]._id),
        seats: [7],
        departureDetails: { city: "Bangalore", time: 6, date: futureDates[0] },
        arrivalDetails: { city: "Mysore", time: "09:00", date: futureDates[0] },
        duration: "3h 0m",
        boardingStopSequence: 1,
        droppingStopSequence: 3,
        boardingStopName: "Bangalore - Majestic Bus Station",
        droppingStopName: "Mysore - Mysore Bus Stand",
        segmentDistanceKm: 150,
        journeyDate: futureDates[0],
        busDetails: { operatorName: "Neeta Travels", busType: "standard", image: "/images/buses/neeta-standard.jpg", departureTime: "06:00" },
        paymentStatus: "verified",
        timeline: [
          { status: "booked", at: new Date() },
          { status: "payment_verified", at: new Date() },
          { status: "ticket_confirmed", at: new Date() },
        ],
      },
      {
        customerId: "cust-seed-004",
        passengerDetails: [passengerNames[4], passengerNames[5], passengerNames[6]],
        email: "vikram@example.com",
        phoneNumber: "9876543213",
        fare: 2800,
        status: "ticket_confirmed",
        bookingDate: futureDates[3],
        busId: String(savedBuses[8]._id),
        seats: [5, 6, 7],
        departureDetails: { city: "Coimbatore", time: 22, date: futureDates[3] },
        arrivalDetails: { city: "Bangalore", time: "05:30", date: futureDates[4] },
        duration: "7h 0m",
        boardingStopSequence: 1,
        droppingStopSequence: 4,
        boardingStopName: "Coimbatore - Gandhipuram Bus Stand",
        droppingStopName: "Bangalore - Majestic Bus Station",
        segmentDistanceKm: 370,
        journeyDate: futureDates[3],
        busDetails: { operatorName: "Bharat Express", busType: "luxury-sleeper", image: "/images/buses/bharat-luxury-sleeper.jpg", departureTime: "22:30" },
        paymentStatus: "verified",
        timeline: [
          { status: "booked", at: new Date() },
          { status: "payment_verified", at: new Date() },
          { status: "ticket_confirmed", at: new Date() },
        ],
      },
      {
        customerId: "cust-seed-005",
        passengerDetails: [passengerNames[7]],
        email: "deepa@example.com",
        phoneNumber: "9876543214",
        fare: 350,
        status: "cancelled",
        bookingDate: futureDates[0],
        busId: String(savedBuses[6]._id),
        seats: [12],
        departureDetails: { city: "Chennai", time: 7, date: futureDates[0] },
        arrivalDetails: { city: "Pondicherry", time: "11:00", date: futureDates[0] },
        duration: "3h 30m",
        boardingStopSequence: 1,
        droppingStopSequence: 3,
        boardingStopName: "Chennai - Tambaram Bus Stand",
        droppingStopName: "Pondicherry - Pondicherry Bus Stand",
        segmentDistanceKm: 150,
        journeyDate: futureDates[0],
        busDetails: { operatorName: "Parveen Travels", busType: "A/C Seater", image: "/images/buses/parveen-ac-seater.jpg", departureTime: "07:30" },
        paymentStatus: "refunded",
        timeline: [
          { status: "booked", at: new Date() },
          { status: "cancelled", at: new Date() },
        ],
      },
      {
        customerId: "cust-seed-006",
        passengerDetails: [passengerNames[0], passengerNames[3]],
        email: "rajesh@example.com",
        phoneNumber: "9876543210",
        fare: 1100,
        status: "ticket_confirmed",
        bookingDate: futureDates[5],
        busId: String(savedBuses[10]._id),
        seats: [20, 21],
        departureDetails: { city: "Bangalore", time: 20, date: futureDates[5] },
        arrivalDetails: { city: "Hyderabad", time: "06:00", date: futureDates[6] },
        duration: "10h 0m",
        boardingStopSequence: 1,
        droppingStopSequence: 4,
        boardingStopName: "Bangalore - Majestic Bus Station",
        droppingStopName: "Hyderabad - MGBS",
        segmentDistanceKm: 570,
        journeyDate: futureDates[5],
        busDetails: { operatorName: "GreenLine Travels", busType: "standard", image: "/images/buses/greenline-standard.jpg", departureTime: "20:00" },
        paymentStatus: "verified",
        timeline: [
          { status: "booked", at: new Date() },
          { status: "payment_verified", at: new Date() },
          { status: "ticket_confirmed", at: new Date() },
        ],
      },
      {
        customerId: "cust-seed-007",
        passengerDetails: [passengerNames[1]],
        email: "priya@example.com",
        phoneNumber: "9876543211",
        fare: 900,
        status: "pending_payment",
        bookingDate: futureDates[4],
        busId: String(savedBuses[3]._id),
        seats: [15],
        departureDetails: { city: "Chennai", time: 21, date: futureDates[4] },
        arrivalDetails: { city: "Coimbatore", time: "06:00", date: futureDates[5] },
        duration: "9h 0m",
        boardingStopSequence: 1,
        droppingStopSequence: 3,
        boardingStopName: "Chennai - Koyambedu Bus Terminal",
        droppingStopName: "Coimbatore - Gandhipuram Bus Stand",
        segmentDistanceKm: 510,
        journeyDate: futureDates[4],
        busDetails: { operatorName: "KSRTC", busType: "A/C Sleeper", image: "/images/buses/ksrtc-ac-sleeper.jpg", departureTime: "21:00" },
        paymentStatus: "pending",
        timeline: [
          { status: "booked", at: new Date() },
        ],
      },
    ];

    const savedBookings = [];
    for (const b of sampleBookings) {
      const booking = await Booking.create(b);
      savedBookings.push(booking);
      console.log(`  Booking: ${b.customerId} on ${b.busDetails.operatorName} — ${b.status}`);
    }

    console.log(`Created ${savedBookings.length} bookings`);

    // ──────────────────────────────────────────────
    //  SEAT LOCKS
    // ──────────────────────────────────────────────

    const seatLockData = [
      {
        busId: String(savedBuses[0]._id),
        date: futureDates[1],
        bookedSeats: [3, 4, 15, 16],
        segmentBookings: [
          { seatNumber: 3, boardingSequence: 1, droppingSequence: 4, bookingId: String(savedBookings[0]._id) },
          { seatNumber: 4, boardingSequence: 1, droppingSequence: 4, bookingId: String(savedBookings[0]._id) },
          { seatNumber: 15, boardingSequence: 1, droppingSequence: 3, bookingId: "" },
          { seatNumber: 16, boardingSequence: 1, droppingSequence: 3, bookingId: "" },
        ],
      },
      {
        busId: String(savedBuses[1]._id),
        date: futureDates[2],
        bookedSeats: [10, 11, 22],
        segmentBookings: [
          { seatNumber: 10, boardingSequence: 1, droppingSequence: 4, bookingId: String(savedBookings[1]._id) },
          { seatNumber: 11, boardingSequence: 1, droppingSequence: 4, bookingId: String(savedBookings[1]._id) },
          { seatNumber: 22, boardingSequence: 2, droppingSequence: 4, bookingId: "" },
        ],
      },
      {
        busId: String(savedBuses[5]._id),
        date: futureDates[0],
        bookedSeats: [7, 8, 9, 20, 21],
        segmentBookings: [
          { seatNumber: 7, boardingSequence: 1, droppingSequence: 3, bookingId: String(savedBookings[2]._id) },
          { seatNumber: 8, boardingSequence: 2, droppingSequence: 3, bookingId: "" },
          { seatNumber: 9, boardingSequence: 1, droppingSequence: 3, bookingId: "" },
          { seatNumber: 20, boardingSequence: 1, droppingSequence: 3, bookingId: "" },
          { seatNumber: 21, boardingSequence: 1, droppingSequence: 3, bookingId: "" },
        ],
      },
      {
        busId: String(savedBuses[8]._id),
        date: futureDates[3],
        bookedSeats: [5, 6, 7, 18, 19, 20],
        segmentBookings: [
          { seatNumber: 5, boardingSequence: 1, droppingSequence: 4, bookingId: String(savedBookings[3]._id) },
          { seatNumber: 6, boardingSequence: 1, droppingSequence: 4, bookingId: String(savedBookings[3]._id) },
          { seatNumber: 7, boardingSequence: 1, droppingSequence: 4, bookingId: String(savedBookings[3]._id) },
          { seatNumber: 18, boardingSequence: 2, droppingSequence: 4, bookingId: "" },
          { seatNumber: 19, boardingSequence: 2, droppingSequence: 4, bookingId: "" },
          { seatNumber: 20, boardingSequence: 3, droppingSequence: 4, bookingId: "" },
        ],
      },
      {
        busId: String(savedBuses[10]._id),
        date: futureDates[5],
        bookedSeats: [20, 21, 30, 31, 32],
        segmentBookings: [
          { seatNumber: 20, boardingSequence: 1, droppingSequence: 4, bookingId: String(savedBookings[5]._id) },
          { seatNumber: 21, boardingSequence: 1, droppingSequence: 4, bookingId: String(savedBookings[5]._id) },
          { seatNumber: 30, boardingSequence: 1, droppingSequence: 3, bookingId: "" },
          { seatNumber: 31, boardingSequence: 2, droppingSequence: 4, bookingId: "" },
          { seatNumber: 32, boardingSequence: 1, droppingSequence: 4, bookingId: "" },
        ],
      },
    ];

    for (const sl of seatLockData) {
      await SeatLock.create(sl);
      console.log(`  SeatLock: bus ${sl.busId.slice(-6)} on ${sl.date} — ${sl.bookedSeats.length} seats locked`);
    }

    console.log(`Created ${seatLockData.length} seat lock records`);

    // ──────────────────────────────────────────────
    //  SUMMARY
    // ──────────────────────────────────────────────

    console.log("\n========================================");
    console.log("  SEED COMPLETE — SUMMARY");
    console.log("========================================");
    console.log(`  Routes created:    10`);
    console.log(`  Buses created:     ${savedBuses.length}`);
    console.log(`  Bookings created:  ${savedBookings.length}`);
    console.log(`  SeatLocks created: ${seatLockData.length}`);
    console.log("========================================");
    console.log("  Routes:");
    console.log(`    1. Chennai → Bangalore      (${route1._id})`);
    console.log(`    2. Chennai → Madurai         (${route2._id})`);
    console.log(`    3. Chennai → Coimbatore      (${route3._id})`);
    console.log(`    4. Bangalore → Chennai       (${route4._id})`);
    console.log(`    5. Bangalore → Mysore        (${route5._id})`);
    console.log(`    6. Chennai → Pondicherry     (${route6._id})`);
    console.log(`    7. Chennai → Trichy          (${route7._id})`);
    console.log(`    8. Coimbatore → Bangalore    (${route8._id})`);
    console.log(`    9. Madurai → Chennai         (${route9._id})`);
    console.log(`   10. Bangalore → Hyderabad     (${route10._id})`);
    console.log("========================================");
    console.log("  Buses:");
    for (const b of savedBuses) {
      const routeObj = [route1, route2, route3, route4, route5, route6, route7, route8, route9, route10]
        .find(r => String(r._id) === String(b.routes));
      const routeLabel = routeObj ? routeObj.routeName : "Unknown";
      console.log(`    • ${b.operatorName.padEnd(22)} ${b.busType.padEnd(16)} dep=${b.departureTime} seats=${b.totalSeats} → ${routeLabel}`);
    }
    console.log("========================================");
    console.log("  Seat availability is now realistic:");
    console.log("  Search results will show remaining seats.");
    console.log("========================================");

    process.exit(0);
  } catch (error) {
    console.error("Seed error:", error.message);
    console.error(error);
    process.exit(1);
  }
}

seed();
