/**
 * Seed script for segment-based bus booking.
 *
 * Creates:
 *   Route 1: Chennai → Vellore → Krishnagiri → Bangalore → Mysore (5 stops)
 *   Route 2: Chennai → Vellore → Bangalore → Mysore → Mangalore (5 stops)
 *   6 Buses total (3 per route)
 *
 * Usage:
 *   cd frontend/server
 *   node scripts/seed-booking-data.js
 *
 * Requires MONGODB_URI in .env
 */
const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const Route = require("../models/route");
const Bus = require("../models/bus");

const route1Stops = [
  {
    stopName: "Chennai",
    stopId: "chennai-001",
    sequence: 1,
    departureTime: "08:00",
    arrivalTime: "08:00",
    distanceFromOrigin: 0,
    latitude: 13.0827,
    longitude: 80.2707,
    boardingPoints: ["Koyambedu Bus Terminal", "CMBT"],
    droppingPoints: ["Koyambedu Bus Terminal", "CMBT"],
  },
  {
    stopName: "Vellore",
    stopId: "vellore-002",
    sequence: 2,
    departureTime: "09:30",
    arrivalTime: "09:20",
    distanceFromOrigin: 140,
    latitude: 12.9165,
    longitude: 79.1325,
    boardingPoints: ["Vellore Bus Stand"],
    droppingPoints: ["Vellore Bus Stand"],
  },
  {
    stopName: "Krishnagiri",
    stopId: "krishnagiri-003",
    sequence: 3,
    departureTime: "11:00",
    arrivalTime: "10:50",
    distanceFromOrigin: 260,
    latitude: 12.5186,
    longitude: 78.2137,
    boardingPoints: ["Krishnagiri Bus Stand"],
    droppingPoints: ["Krishnagiri Bus Stand"],
  },
  {
    stopName: "Bangalore",
    stopId: "bangalore-004",
    sequence: 4,
    departureTime: "13:00",
    arrivalTime: "13:00",
    distanceFromOrigin: 350,
    latitude: 12.9716,
    longitude: 77.5946,
    boardingPoints: ["Majestic Bus Station", "Silk Board Junction"],
    droppingPoints: ["Majestic Bus Station", "Hebbal Bus Stand"],
  },
  {
    stopName: "Mysore",
    stopId: "mysore-005",
    sequence: 5,
    departureTime: "15:30",
    arrivalTime: "15:30",
    distanceFromOrigin: 520,
    latitude: 12.2958,
    longitude: 76.6394,
    boardingPoints: ["Mysore Bus Stand", "Hunsur Road Bus Stop"],
    droppingPoints: ["Mysore Bus Stand", "Hunsur Road Bus Stop"],
  },
];

const route2Stops = [
  {
    stopName: "Chennai",
    stopId: "chennai-001",
    sequence: 1,
    departureTime: "19:00",
    arrivalTime: "19:00",
    distanceFromOrigin: 0,
    latitude: 13.0827,
    longitude: 80.2707,
    boardingPoints: ["Koyambedu Bus Terminal", "CMBT"],
    droppingPoints: ["Koyambedu Bus Terminal", "CMBT"],
  },
  {
    stopName: "Vellore",
    stopId: "vellore-002",
    sequence: 2,
    departureTime: "20:30",
    arrivalTime: "20:20",
    distanceFromOrigin: 140,
    latitude: 12.9165,
    longitude: 79.1325,
    boardingPoints: ["Vellore Bus Stand"],
    droppingPoints: ["Vellore Bus Stand"],
  },
  {
    stopName: "Bangalore",
    stopId: "bangalore-004",
    sequence: 3,
    departureTime: "01:00",
    arrivalTime: "01:00",
    distanceFromOrigin: 350,
    latitude: 12.9716,
    longitude: 77.5946,
    boardingPoints: ["Majestic Bus Station", "Silk Board Junction"],
    droppingPoints: ["Majestic Bus Station", "Hebbal Bus Stand"],
  },
  {
    stopName: "Mysore",
    stopId: "mysore-005",
    sequence: 4,
    departureTime: "03:30",
    arrivalTime: "03:30",
    distanceFromOrigin: 520,
    latitude: 12.2958,
    longitude: 76.6394,
    boardingPoints: ["Mysore Bus Stand", "Hunsur Road Bus Stop"],
    droppingPoints: ["Mysore Bus Stand", "Hunsur Road Bus Stop"],
  },
  {
    stopName: "Mangalore",
    stopId: "mangalore-006",
    sequence: 5,
    departureTime: "06:30",
    arrivalTime: "06:30",
    distanceFromOrigin: 810,
    latitude: 12.9141,
    longitude: 74.8560,
    boardingPoints: ["Mangalore KSRTC Bus Stand"],
    droppingPoints: ["Mangalore KSRTC Bus Stand"],
  },
];

const fareConfig = {
  baseFare: 200,
  pricePerKm: 1.8,
  minimumFare: 250,
  taxPercent: 5,
  serviceFee: 15,
  busTypeMultipliers: new Map([
    ["standard", 1.0],
    ["sleeper", 1.8],
    ["A/C Seater", 1.5],
    ["A/C Sleeper", 2.0],
    ["volvo", 2.2],
    ["Non-A/C", 0.9],
  ]),
  seatTypePremiums: new Map([
    ["regular", 0],
    ["window", 30],
    ["aisle", 20],
    ["lower-berth", 50],
    ["upper-berth", 40],
  ]),
  dynamicPricing: {
    enabled: true,
    thresholds: { lowOccupancy: 50, midOccupancy: 75, highOccupancy: 90 },
    surcharges: { low: 0, mid: 5, high: 10, peak: 15 },
    weekendMultiplier: 1.05,
    holidayMultiplier: 1.10,
  },
};

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
    console.log("Cleared existing routes and buses");

    // --- Route 1: Chennai → Vellore → Krishnagiri → Bangalore → Mysore ---
    const route1 = await Route.create({
      routeName: "Chennai to Mysore via Krishnagiri",
      departureLocation: { name: "Chennai", subLocations: ["Koyambedu", "CMBT"] },
      arrivalLocation: { name: "Mysore", subLocations: ["Mysore Bus Stand", "Hunsur Road"] },
      duration: 9.5,
      stops: route1Stops,
      totalDistanceKm: 520,
      fareConfig,
      isActive: true,
    });
    console.log(`Route 1: ${route1.routeName} (${route1._id})`);

    // --- Route 2: Chennai → Vellore → Bangalore → Mysore → Mangalore ---
    const route2 = await Route.create({
      routeName: "Chennai to Mangalore via Bangalore",
      departureLocation: { name: "Chennai", subLocations: ["Koyambedu", "CMBT"] },
      arrivalLocation: { name: "Mangalore", subLocations: ["Mangalore KSRTC Bus Stand"] },
      duration: 12,
      stops: route2Stops,
      totalDistanceKm: 810,
      fareConfig,
      isActive: true,
    });
    console.log(`Route 2: ${route2.routeName} (${route2._id})`);

    // --- Buses on Route 1 ---
    const buses1 = [
      { operatorName: "KPN Travels", busType: "A/C Seater", departureTime: "08:00", totalSeats: 40, images: "/images/buses/kpn-ac-seater.jpg", liveTracking: 1, reschedulable: 1, rating: [4.3, 4.5, 4.2, 4.4], routes: route1._id, operatingDays: [0, 1, 2, 3, 4, 5, 6] },
      { operatorName: "SRS Travels", busType: "sleeper", departureTime: "08:00", totalSeats: 36, images: "/images/buses/srs-sleeper.jpg", liveTracking: 1, reschedulable: 0, rating: [4.5, 4.6, 4.4], routes: route1._id, operatingDays: [0, 1, 2, 3, 4, 5, 6] },
      { operatorName: "VRL Travels", busType: "standard", departureTime: "08:00", totalSeats: 40, images: "/images/buses/vrl-standard.jpg", liveTracking: 0, reschedulable: 0, rating: [4.0, 3.9, 4.1], routes: route1._id, operatingDays: [1, 2, 3, 4, 5] },
    ];

    for (const b of buses1) {
      const bus = await Bus.create(b);
      console.log(`  Bus: ${bus.operatorName} (${bus.busType}) → Route 1`);
    }

    // --- Buses on Route 2 ---
    const buses2 = [
      { operatorName: "KSRTC", busType: "A/C Sleeper", departureTime: "19:00", totalSeats: 30, images: "/images/buses/ksrtc-ac-sleeper.jpg", liveTracking: 1, reschedulable: 1, rating: [4.6, 4.7, 4.5], routes: route2._id, operatingDays: [0, 1, 2, 3, 4, 5, 6] },
      { operatorName: "Paulo Travels", busType: "volvo", departureTime: "19:00", totalSeats: 40, images: "/images/buses/paulo-volvo.jpg", liveTracking: 1, reschedulable: 1, rating: [4.4, 4.3], routes: route2._id, operatingDays: [0, 2, 4, 6] },
      { operatorName: "Neeta Travels", busType: "standard", departureTime: "19:00", totalSeats: 45, images: "/images/buses/neeta-standard.jpg", liveTracking: 0, reschedulable: 0, rating: [3.9, 4.0], routes: route2._id, operatingDays: [0, 1, 2, 3, 4, 5, 6] },
    ];

    for (const b of buses2) {
      const bus = await Bus.create(b);
      console.log(`  Bus: ${bus.operatorName} (${bus.busType}) → Route 2`);
    }

    console.log("\n--- Seed Complete ---");
    console.log(`Routes: 2`);
    console.log(`Buses: ${buses1.length + buses2.length}`);
    console.log(`Fare: baseFare=₹${fareConfig.baseFare}, pricePerKm=₹${fareConfig.pricePerKm}, tax=${fareConfig.taxPercent}%`);
    process.exit(0);
  } catch (error) {
    console.error("Seed error:", error.message);
    console.error(error);
    process.exit(1);
  }
}

seed();
