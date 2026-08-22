/* Integration test for the Task 6 review system.
 * Seeds temp records (tagged __revtest__), exercises the public API on a
 * locally running server (port 5000), then deletes every temp record.
 * Run: node scripts/review-api-test.js  (server must be running)
 */
require("dotenv").config();
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const Customer = require("../models/customer");
const Bus = require("../models/bus");
const Route = require("../models/route");
const Booking = require("../models/booking");
const Review = require("../models/review");

const BASE = process.env.TEST_BASE_URL || "http://localhost:5000";
const SPAWN_SERVER = process.env.TEST_SPAWN_SERVER === "1";

async function waitUntilReady() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(BASE + "/api/reviews/route/000000000000000000000000");
      if (res.status === 400 || res.status === 200) return; // server answering
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("server did not become ready on " + BASE);
}
const TAG = "__revtest__";
let passed = 0;
let failed = 0;

function check(name, cond, extra) {
  if (cond) {
    passed++;
    console.log(`PASS ${name}`);
  } else {
    failed++;
    console.log(`FAIL ${name}${extra !== undefined ? " :: " + JSON.stringify(extra) : ""}`);
  }
}

async function api(method, path, token, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch (_) {}
  return { status: res.status, json };
}

function mkToken(user) {
  return jwt.sign({ id: user._id.toString(), email: user.email }, process.env.JWT_SECRET, { expiresIn: "1h" });
}

async function cleanup() {
  const users = await Customer.find({ email: { $regex: TAG } }).select("_id").lean();
  const userIds = users.map((u) => u._id.toString());
  await Review.deleteMany({ $or: [{ customerId: { $in: userIds } }, { routeId: { $exists: true }, title: { $regex: TAG } }] });
  await Booking.deleteMany({ email: { $regex: TAG } });
  await Bus.deleteMany({ operatorName: { $regex: TAG } });
  await Route.deleteMany({ routeName: { $regex: TAG } });
  await Customer.deleteMany({ email: { $regex: TAG } });
}

async function main() {
  let child = null;
  if (SPAWN_SERVER) {
    const { spawn } = require("child_process");
    const path = require("path");
    child = spawn(process.execPath, [path.join(__dirname, "..", "index.js")], {
      cwd: path.join(__dirname, ".."),
      env: { ...process.env, PORT: "5100" },
      stdio: "ignore",
      detached: false,
    });
    console.log(`spawned test server pid=${child.pid} on :5100`);
  }
  try {
    await waitUntilReady();
    await runTests();
  } finally {
    if (child) child.kill();
  }
}

async function runTests() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("connected to db");
  await cleanup();

  // ---- seed ----
  const [userA, userB, userC, userD, userE] = await Customer.insertMany([
    { name: "RevTester A", email: `a${TAG}@t.com`, isVerified: true },
    { name: "RevTester B", email: `b${TAG}@t.com`, isVerified: true },
    { name: "RevTester C", email: `c${TAG}@t.com`, isVerified: true },
    { name: "RevTester D", email: `d${TAG}@t.com`, isVerified: true },
    { name: "RevTester E", email: `e${TAG}@t.com`, isVerified: false },
  ]);
  const tokA = mkToken(userA);
  const tokB = mkToken(userB);
  const tokC = mkToken(userC);
  const tokD = mkToken(userD);
  const tokE = mkToken(userE);

  const pastDate = new Date(Date.now() - 26 * 3600 * 1000);
  const ymd = pastDate.toISOString().slice(0, 10);

  const route = await Route.create({
    routeName: TAG + " Route",
    departureLocation: { name: "Chennai", subLocations: ["Koyambedu"] },
    arrivalLocation: { name: "Bengaluru", subLocations: ["Madiwala"] },
    duration: 8,
    totalDistanceKm: 350,
    stops: [
      { stopName: "Chennai", stopId: TAG + "s1", sequence: 1, departureTime: "10:00 PM", arrivalTime: "10:00 PM", distanceFromOrigin: 0 },
      { stopName: "Bengaluru", stopId: TAG + "s2", sequence: 2, departureTime: "06:00 AM", arrivalTime: "06:00 AM", distanceFromOrigin: 350 },
    ],
  });

  const bus = await Bus.create({
    operatorName: TAG + " Travels",
    busType: "standard",
    departureTime: "22:00",
    rating: [],
    totalSeats: 40,
    routes: [route._id],
    images: "https://example.com/bus.jpg",
    liveTracking: true,
    reschedulable: true,
  });

  async function mkBooking(user, status, paymentStatus, dateStr) {
    return Booking.create({
      customerId: user._id.toString(),
      passengerDetails: [{ name: "T", gender: "M", age: 30 }],
      email: user.email,
      phoneNumber: "9999999999",
      fare: 500,
      status,
      bookingDate: dateStr,
      busId: bus._id.toString(),
      seats: [3],
      departureDetails: { city: "Chennai", time: 1320, date: dateStr },
      arrivalDetails: { city: "Bengaluru", time: "05:00 AM", date: dateStr },
      duration: "7h 00m",
      paymentStatus,
      pnr: TAG + Math.random().toString(36).slice(2, 8),
    });
  }

  const completedBooking = await mkBooking(userA, "completed", "verified", ymd);
  const futureBooking = await mkBooking(userA, "ticket_confirmed", "verified", "2027-01-01");
  const unverifiedBooking = await mkBooking(userE, "completed", "verified", ymd);

  // ---- tests ----
  let r = await api("GET", `/api/reviews/route/${route._id}`);
  check("public route reviews empty", r.status === 200 && r.json.stats && r.json.stats.totalReviews === 0, r.json);

  r = await api("GET", `/api/reviews/eligibility?bookingId=${completedBooking._id}&routeId=${route._id}`);
  check("eligibility unauthenticated -> 401", r.status === 401, r.json);

  r = await api("GET", `/api/reviews/eligibility?bookingId=${completedBooking._id}&routeId=${route._id}`, tokB);
  check("eligibility wrong owner -> booking_not_owned", r.status === 200 && r.json.eligible === false && r.json.reason === "booking_not_owned", r.json);

  r = await api("GET", `/api/reviews/eligibility?bookingId=${futureBooking._id}&routeId=${route._id}`, tokA);
  check("eligibility future journey -> journey_not_completed", r.status === 200 && r.json.eligible === false && r.json.reason === "journey_not_completed", r.json);

  r = await api("GET", `/api/reviews/eligibility?bookingId=${unverifiedBooking._id}&routeId=${route._id}`, tokE);
  check("eligibility unverified account -> unverified_account", r.status === 200 && r.json.eligible === false && r.json.reason === "unverified_account", r.json);

  r = await api("GET", `/api/reviews/eligibility?bookingId=${completedBooking._id}&routeId=${route._id}`, tokA);
  check("eligibility ok", r.status === 200 && r.json.eligible === true && r.json.booking && r.json.booking.pnr, r.json);

  r = await api("POST", "/api/reviews", tokA, {
    bookingId: completedBooking._id.toString(),
    routeId: route._id.toString(),
    busId: bus._id.toString(),
    rating: 4.5,
    title: "Good trip",
    comment: "Comfortable journey with polite staff and clean seats throughout the ride.",
  });
  check("create rejects fractional rating -> invalid_rating", r.status === 400 && r.json.reason === "invalid_rating", r.json);

  r = await api("POST", "/api/reviews", tokA, {
    bookingId: completedBooking._id.toString(),
    routeId: route._id.toString(),
    busId: bus._id.toString(),
    rating: 4,
    title: "Good trip",
    comment: "Too short.",
  });
  check("create rejects short comment -> comment_too_short", r.status === 400 && r.json.reason === "comment_too_short", r.json);

  r = await api("POST", "/api/reviews", tokA, {
    bookingId: completedBooking._id.toString(),
    routeId: route._id.toString(),
    busId: bus._id.toString(),
    rating: 4,
    title: TAG + " Good trip",
    comment: "Comfortable journey with polite staff and clean seats throughout the ride.",
  });
  check("create review success", r.status === 201 && r.json.review && r.json.review.rating === 4, r.json);
  check("create returns stats", r.json.stats && r.json.stats.totalReviews === 1 && r.json.stats.avgRating === 4, r.json.stats);
  const reviewId = r.json.review ? r.json.review._id : null;

  r = await api("POST", "/api/reviews", tokA, {
    bookingId: completedBooking._id.toString(),
    routeId: route._id.toString(),
    busId: bus._id.toString(),
    rating: 5,
    title: "Again",
    comment: "Trying to review the same journey twice should be rejected by the server.",
  });
  check("duplicate journey review -> already_reviewed", r.status === 409 && r.json.reason === "already_reviewed", r.json);

  r = await api("PUT", `/api/reviews/${reviewId}`, tokA, {
    rating: 5,
    title: TAG + " Updated title",
    comment: "Edited after reconsidering - excellent drive and on-time arrival at the destination.",
  });
  check("update within window", r.status === 200 && r.json.review.isEdited === true && r.json.review.rating === 5, r.json);

  r = await api("POST", `/api/reviews/${reviewId}/helpful`, tokB);
  check("helpful vote on", r.status === 200 && r.json.helpfulCount === 1 && r.json.voted === true, r.json);

  r = await api("POST", `/api/reviews/${reviewId}/helpful`, tokB);
  check("helpful toggle off", r.status === 200 && r.json.helpfulCount === 0 && r.json.voted === false, r.json);

  r = await api("POST", `/api/reviews/${reviewId}/helpful`, tokA);
  check("cannot vote own review", r.status === 400 && r.json.reason === "own_review", r.json);

  // viewer context: B votes again, then the public list must reflect it
  await api("POST", `/api/reviews/${reviewId}/helpful`, tokB);
  r = await api("GET", `/api/reviews/route/${route._id}`, tokB);
  check("viewer sees votedReviewIds/myReviewId", r.json.viewer && (r.json.viewer.votedReviewIds || []).includes(reviewId), r.json.viewer);

  r = await api("POST", `/api/reviews/${reviewId}/report`, tokB, { reason: "spam" });
  check("report accepted", r.status === 200 && r.json.reportCount === 1, r.json);

  r = await api("POST", `/api/reviews/${reviewId}/report`, tokB, { reason: "spam" });
  check("duplicate report rejected", r.status === 409 && r.json.reason === "already_reported", r.json);

  r = await api("POST", `/api/reviews/${reviewId}/report`, tokC, { reason: "abuse" });
  check("second report", r.status === 200 && r.json.reportCount === 2, r.json);

  r = await api("POST", `/api/reviews/${reviewId}/report`, tokD, { reason: "fake" });
  check("third report auto-hides", r.status === 200 && r.json.hidden === true && r.json.reportCount === 3, r.json);

  r = await api("GET", `/api/reviews/route/${route._id}`);
  check("hidden review excluded from public list", r.json.reviews.length === 0 && r.json.stats.totalReviews === 0, r.json);

  r = await api("GET", "/api/reviews/user/me", tokA);
  check("my-reviews lists own review", r.status === 200 && r.json.reviews.length === 1 && r.json.reviews[0]._id === reviewId, r.json);

  r = await api("DELETE", `/api/reviews/${reviewId}`, tokA);
  check("owner delete", r.status === 200, r.json);

  r = await api("GET", `/api/reviews/bus/${bus._id}`);
  check("legacy bus endpoint works", r.status === 200 && r.json.stats && r.json.stats.totalReviews === 0, r.json);

  // ---- cleanup ----
  await cleanup();
  const leftover = await Review.countDocuments({ customerId: { $in: [userA._id, userB._id] } });
  console.log(`\nRESULT: ${passed} passed, ${failed} failed, leftovers=${leftover}`);
  await mongoose.disconnect();
  return failed === 0 ? 0 : 1;
}

main()
  .then((code) => process.exit(code))
  .catch(async (err) => {
    console.error("TEST CRASH:", err);
    try { await cleanup(); } catch (_) {}
    try { await mongoose.disconnect(); } catch (_) {}
    process.exit(1);
  });
