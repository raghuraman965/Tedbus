const path = require("path");
const fs = require("fs");
const envPath = path.join(__dirname, "..", ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
const mongoose = require("mongoose");

(async () => {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  const db = mongoose.connection.db;
  console.log("== ALL ROUTES ==");
  const routes = await db.collection("routes").find({}).toArray();
  for (const r of routes) {
    console.log(`${r._id} | ${r.departureLocation?.name} -> ${r.arrivalLocation?.name} | duration=${r.duration} (${typeof r.duration}) | stops=${(r.stops||[]).length} | dist=${r.totalDistanceKm}`);
    if (r.stops && r.stops.length) {
      const s0 = r.stops[0], sN = r.stops[r.stops.length - 1];
      console.log(`   first: seq=${s0.sequence} dep=${s0.departureTime} arr=${s0.arrivalTime} | last: seq=${sN.sequence} dep=${sN.departureTime} arr=${sN.arrivalTime}`);
    }
  }
  console.log("\n== ALL BUSES ==");
  const buses = await db.collection("buses").find({}).toArray();
  for (const b of buses) {
    console.log(`${b._id} | ${b.operatorName} | ${b.busType} | dep=${b.departureTime} | route=${b.routes} | seats=${b.totalSeats} | ratings=${JSON.stringify(b.rating)}`);
  }
  console.log("\n== ALL BOOKINGS (summary) ==");
  const bookings = await db.collection("bookings").find({}).toArray();
  for (const b of bookings) {
    console.log(`${b._id} | cust=${b.customerId} | bus=${b.busId} | status=${b.status} pay=${b.paymentStatus} | dep=${b.departureDetails?.date} ${b.departureDetails?.time} | arr=${b.arrivalDetails?.date} ${b.arrivalDetails?.time} | dur=${b.duration} | seg=${b.boardingStopSequence}->${b.droppingStopSequence} | pnr=${b.pnr || "-"}`);
  }
  console.log("\n== REVIEWS with bus existence check ==");
  const reviews = await db.collection("reviews").find({}).toArray();
  for (const rv of reviews) {
    const busExists = buses.some(b => String(b._id) === String(rv.busId));
    console.log(`${rv._id} | bus=${rv.busId} (exists=${busExists}) | cust=${rv.customerId} | rating=${rv.rating} | visible=${rv.visible} | bookingId=${rv.bookingId || "-"}`);
  }
  // indexes
  console.log("\n== review indexes ==");
  console.log(JSON.stringify((await db.collection("reviews").indexes()).map(i => i.name)));
  await mongoose.disconnect();
})().catch(e => { console.error(e.message); process.exit(1); });
