// Backend booking-authentication tests.
//
// Verifies the flows the frontend relies on:
//   1. A guest (no/invalid JWT) is REJECTED by the payment-order, payment-
//      confirmation, seat-lock and booking-creation endpoints (401) and cannot
//      read other users' bookings.
//   2. A logged-in user can confirm a Razorpay payment and create a booking,
//      and the customerId used is always the one from the verified JWT — never
//      the value smuggled in the request body (no account spoofing).
//   3. Payment confirmation enforces HMAC signature verification + attempt
//      ownership before anything is marked `verified`.
//
// Also guards the existing atomic seat-lock / double-booking protection so the
// auth changes do not regress it.
//
// No database is needed: mongoose models are swapped for in-memory fakes via
// require-cache injection BEFORE the module under test is loaded. The real
// model files must never be required more than once in a process (mongoose
// throws OverwriteModelError on a second mongoose.model() call), so the real
// modules' caches are deliberately never deleted.

const path = require("path");
const crypto = require("crypto");
const test = require("node:test");
const assert = require("node:assert/strict");

const SERVER = path.join(__dirname, "..");

// JWT_SECRET is no longer baked into the source; middleware/auth.js and
// utils/bookingRef.js require it at load time. Provide a test-only value
// before any module under test is required.
if (!process.env.JWT_SECRET) process.env.JWT_SECRET = "test-secret-booking-auth";

/** Replaces a module's exports in the require cache with an in-memory fake. */
function mockModule(relPath, mock) {
  const abs = require.resolve(path.join(SERVER, relPath));
  delete require.cache[abs];
  require.cache[abs] = { id: abs, filename: abs, loaded: true, exports: mock };
}

/** Forces a fresh load of a module so it picks up the current mocks. */
function fresh(relPath) {
  const abs = require.resolve(path.join(SERVER, relPath));
  delete require.cache[abs];
  return require(abs);
}

// Chainable mongoose-query fake: supports .lean().sort().exec() in any order.
function chainOne(result) {
  const q = {};
  q.lean = () => q;
  q.sort = () => q;
  q.exec = async () => result;
  return q;
}

// ---------------------------------------------------------------------------
// requireAuth middleware
// ---------------------------------------------------------------------------

function authHarness(customer) {
  // The mock must be installed BEFORE the middleware is loaded, otherwise the
  // real Customer model file executes (and cannot be re-executed).
  mockModule("models/customer", {
    findById: () => chainOne(customer),
  });
  return fresh("middleware/auth");
}

function reqWithToken(token) {
  return {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: {},
  };
}

function jsonRes() {
  let status = 0;
  const res = {
    status(code) { status = code; return this; },
    json(payload) { this.body = payload; return this; },
    send(payload) { this.body = payload; return this; },
  };
  return { res, status: () => status };
}

test("requireAuth: rejects a request with no token (401)", async () => {
  const auth = authHarness(null);
  const req = reqWithToken(null);
  const { res, status } = jsonRes();
  await auth.requireAuth(req, res, () => assert.fail("next() must not be called"));
  assert.equal(status(), 401);
});

test("requireAuth: rejects an invalid/garbage token (401)", async () => {
  const auth = authHarness({ _id: "u1" });
  const req = reqWithToken("not-a-real-token");
  const { res, status } = jsonRes();
  await auth.requireAuth(req, res, () => assert.fail("next() must not be called"));
  assert.equal(status(), 401);
});

test("requireAuth: rejects a valid token for a deleted customer (401)", async () => {
  const auth = fresh("middleware/auth");
  const token = auth.signToken({ _id: "ghost", email: "ghost@test.com" });
  mockModule("models/customer", { findById: () => chainOne(null) });
  const authReloaded = fresh("middleware/auth");
  const req = reqWithToken(token);
  const { res, status } = jsonRes();
  await authReloaded.requireAuth(req, res, () => assert.fail("next() must not be called"));
  assert.equal(status(), 401);
});

test("requireAuth: rejects a suspended customer (403)", async () => {
  const auth = fresh("middleware/auth");
  const token = auth.signToken({ _id: "susp", email: "s@test.com" });
  mockModule("models/customer", {
    findById: () => chainOne({ _id: "susp", isSuspended: true }),
  });
  const authReloaded = fresh("middleware/auth");
  const req = reqWithToken(token);
  const { res, status } = jsonRes();
  await authReloaded.requireAuth(req, res, () => assert.fail("next() must not be called"));
  assert.equal(status(), 403);
});

test("requireAuth: allows a valid token and exposes req.userId (happy path)", async () => {
  const auth = fresh("middleware/auth");
  const token = auth.signToken({ _id: "u1", email: "a@test.com" });
  mockModule("models/customer", {
    findById: () => chainOne({ _id: "u1", email: "a@test.com", isSuspended: false }),
  });
  const authReloaded = fresh("middleware/auth");
  const req = reqWithToken(token);
  let nextCalled = false;
  await authReloaded.requireAuth(req, {}, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.equal(req.userId, "u1");
});

// ---------------------------------------------------------------------------
// Booking route wiring — protected vs public endpoints
// ---------------------------------------------------------------------------

function routeHandles(router, routePath, method) {
  const layer = router.stack.find(
    (l) => l.route && l.route.path === routePath && (l.route.methods || {})[method]
  );
  assert.ok(layer, `route ${method.toUpperCase()} ${routePath} should exist`);
  return layer.route.stack.map((sub) => sub.handle);
}

test("booking routes: payment order + confirmation + seat locks + creation all require auth", () => {
  const bookingRoutes = fresh("routes/booking");
  // routes/booking loaded the controllers already; require() returns the same
  // cached instances so handler identity can be compared directly.
  const bookingController = require("../controller/booking");
  const paymentController = require("../controller/payment");

  const confirmHandlers = routeHandles(bookingRoutes, "/booking/payment/confirm", "post");
  assert.equal(confirmHandlers.length, 2, "payment/confirm must have exactly 2 handlers");
  assert.equal(confirmHandlers[0].name, "requireAuth", "payment/confirm must be behind requireAuth");
  assert.equal(confirmHandlers[1], paymentController.confirmPayment);

  const orderHandlers = routeHandles(bookingRoutes, "/booking/payment/order", "post");
  assert.equal(orderHandlers.length, 2, "payment/order must have exactly 2 handlers");
  assert.equal(orderHandlers[0].name, "requireAuth", "payment/order must be behind requireAuth");
  assert.equal(orderHandlers[1], paymentController.createOrder);

  const lockHandlers = routeHandles(bookingRoutes, "/booking/seats/lock", "post");
  assert.equal(lockHandlers.length, 2, "seats/lock must have exactly 2 handlers");
  assert.equal(lockHandlers[0].name, "requireAuth", "seats/lock must be behind requireAuth");
  assert.equal(lockHandlers[1], bookingController.lockSeats);

  const releaseHandlers = routeHandles(bookingRoutes, "/booking/seats/release", "post");
  assert.equal(releaseHandlers.length, 2, "seats/release must have exactly 2 handlers");
  assert.equal(releaseHandlers[0].name, "requireAuth", "seats/release must be behind requireAuth");
  assert.equal(releaseHandlers[1], bookingController.releaseSeatLock);

  const createHandlers = routeHandles(bookingRoutes, "/booking", "post");
  assert.equal(createHandlers.length, 2, "POST /booking must have exactly 2 handlers");
  assert.equal(createHandlers[0].name, "requireAuth", "POST /booking must be behind requireAuth");
  assert.equal(createHandlers[1], bookingController.addbooking);

  const listHandlers = routeHandles(bookingRoutes, "/booking/:id", "get");
  assert.equal(listHandlers.length, 2, "GET /booking/:id must have exactly 2 handlers");
  assert.equal(listHandlers[0].name, "requireAuth", "GET /booking/:id must be behind requireAuth");
  assert.equal(listHandlers[1], bookingController.getBooking);
});

test("booking routes: seat viewing + driver verification stay public for guests", () => {
  const bookingRoutes = fresh("routes/booking");
  const bookingController = require("../controller/booking");

  const validateHandlers = routeHandles(bookingRoutes, "/booking/validate-seats", "post");
  assert.deepEqual(validateHandlers, [bookingController.validateSeats], "validate-seats must stay public (guests view seats)");

  const verifyHandlers = routeHandles(bookingRoutes, "/booking/verify-ticket", "post");
  assert.deepEqual(verifyHandlers, [bookingController.verifyTicket], "verify-ticket must stay public (driver scans QR)");
});

// ---------------------------------------------------------------------------
// Controller — customerId is always taken from the authenticated JWT
// ---------------------------------------------------------------------------

const DEFAULT_ROUTE = {
  _id: "r1",
  stops: [
    { sequence: 1, stopName: "Alpha", departureTime: "08:00", arrivalTime: "08:00", distanceFromOrigin: 0, boardingPoints: ["A1"], droppingPoints: [] },
    { sequence: 2, stopName: "Beta", departureTime: "08:45", arrivalTime: "08:40", distanceFromOrigin: 90, boardingPoints: [], droppingPoints: [] },
    { sequence: 3, stopName: "Gamma", departureTime: "10:00", arrivalTime: "10:00", distanceFromOrigin: 200, boardingPoints: [], droppingPoints: ["G1"] },
  ],
  fareConfig: { baseFare: 100, pricePerKm: 1.5, minimumFare: 50, taxPercent: 5, serviceFee: 10 },
};

function installBookingControllerMocks(callLog, overrides = {}) {
  const Booking = {};
  Booking.find = (filter) => { callLog.find = filter; return chainOne(overrides.bookings || []); };
  Booking.findOne = () => chainOne(overrides.booking ?? null);
  Booking.exists = () => chainOne(false);
  Booking.create = async (data) => {
    callLog.bookingCreate = data;
    return {
      _id: "bk1",
      ...data,
      pnr: data.pnr || "TEDTEST1",
      save: async () => {},
    };
  };
  Booking.updateOne = async (...args) => ({ exec: async () => ({ modifiedCount: 1 }) });
  Booking.deleteOne = async () => ({ exec: async () => ({ deletedCount: 1 }) });

  // Verified payment attempt bound to a live hold — matches what
  // POST /booking/payment/confirm produces before booking creation runs.
  const attempt = overrides.paymentAttempt === null ? null : {
    _id: "pa1",
    paymentReference: "REF1",
    customerId: "user123",
    amount: 250,
    method: "razorpay",
    status: "verified",
    transactionId: "TXN1",
    holdId: "H1",
    razorpayOrderId: "order_test_1",
    context: {
      routeId: "r1",
      busId: "bus1",
      date: "2026-08-20",
      seats: [1, 2],
      boardingStopSequence: 1,
      droppingStopSequence: 3,
    },
    expiresAt: new Date(Date.now() + 60000),
    createdAt: new Date(),
    updatedAt: new Date(),
    save() { callLog.attemptSavedStatus = this.status; return Promise.resolve(); },
    ...(overrides.paymentAttempt || {}),
  };

  const PaymentAttempt = {};
  PaymentAttempt.findOne = () => chainOne(attempt);
  PaymentAttempt.create = async (data) => {
    callLog.paymentCreate = data;
    return { _id: "pa1", ...data, createdAt: new Date() };
  };
  PaymentAttempt.updateOne = (filter, update) => {
    callLog.paymentConsume = { filter, update };
    return { exec: async () => ({ modifiedCount: 1 }) };
  };

  const Customer = {
    findById: () => chainOne(overrides.customer ?? { _id: "user123", email: "rider@test.com" }),
  };

  mockModule("models/booking", Booking);
  mockModule("models/bus", {
    findById: () => chainOne({
      operatorName: "Test Lines",
      busType: "sleeper",
      images: "",
      departureTime: "08:00",
      totalSeats: 40,
    }),
  });
  mockModule("models/route", {
    findById: () => chainOne(overrides.route ?? DEFAULT_ROUTE),
  });
  mockModule("models/customer", Customer);
  mockModule("models/paymentAttempt", PaymentAttempt);

  // Segment-aware seat inventory. confirmHolds converts every hold row and
  // must report exactly seats.length conversions for the flow to continue.
  mockModule("controller/seatReservation", {
    HOLD_TTL_MS: 10 * 60 * 1000,
    holdSeatsSegment: async () => ({ success: true }),
    confirmHolds: async (busId, date, holdId, pendingKey) => {
      callLog.confirmHolds = { busId, date, holdId, pendingKey };
      return (overrides.confirmHoldsCount != null) ? overrides.confirmHoldsCount : 2;
    },
    repointRows: async (busId, date, pendingKey, bookingId) => {
      callLog.repointRows = { busId, date, pendingKey, bookingId };
    },
    validateActiveHold: async (args) => {
      callLog.validateActiveHold = args;
      return overrides.holdCheck || { ok: true, hold: { holdId: args.holdId } };
    },
    releaseHold: async () => {},
    releaseSeats: async () => {},
    releaseSegmentSeats: async (busId, date, key) => {
      callLog.released = callLog.released || [];
      callLog.released.push(key);
    },
    getSoldSeats: async () => [],
    // Throwing here makes computeAuthoritativeFare fail inside its own
    // try/catch in addbooking → quote=null → the fare-tolerance branch is
    // skipped and `attempt.amount` becomes the booked fare deterministically.
    getSegmentSoldSeats: async () => { throw new Error("quote-skipped-in-test"); },
  });

  mockModule("services/notificationService", {
    notifyBookingConfirmed: async () => {},
    notifyBookingCancelled: async () => {},
    notifyPaymentSuccessful: async () => {},
  });
  mockModule("services/pdfTicket", { generateTicketPdf: async () => Buffer.from("pdf") });
  mockModule("services/ticketMailer", { sendTicketEmail: async () => true });
  mockModule("services/socket", {
    broadcastSeatsBooked: () => {},
    broadcastSeatsReleased: () => {},
    initSeatLive: () => {},
    emitToUser: () => {},
    emitBroadcast: () => {},
  });

  return attempt;
}

function makeReqRes() {
  const req = {
    headers: {},
    body: {},
    userId: "user123",
    user: { _id: "user123", isAdmin: false },
  };
  let statusCode = 200;
  const res = {
    status(code) { statusCode = code; return this; },
    send(payload) { this.sent = payload; return this; },
    json(payload) { this.sent = payload; return this; },
  };
  return { req, res, status: () => statusCode };
}

test("confirmPayment: rejects another user's paymentReference (403) and marks nothing", async () => {
  const callLog = {};
  installBookingControllerMocks(callLog, {
    paymentAttempt: { customerId: "someoneElse", status: "pending" },
  });
  process.env.RAZORPAY_KEY_SECRET = "test-secret-payments";
  const paymentController = fresh("controller/payment");

  const { req, res, status } = makeReqRes();
  req.body = {
    paymentReference: "REF1",
    razorpay_order_id: "order_test_1",
    razorpay_payment_id: "pay_attacker",
    razorpay_signature: "deadbeef",
  };

  await paymentController.confirmPayment(req, res);

  assert.equal(status(), 403);
  assert.equal(callLog.attemptSavedStatus, undefined, "attempt must not be mutated for a foreign owner");
});

test("confirmPayment: verifies the Razorpay HMAC signature and marks the attempt verified", async () => {
  const callLog = {};
  installBookingControllerMocks(callLog, { paymentAttempt: { status: "pending" } });
  const secret = "test-secret-payments";
  process.env.RAZORPAY_KEY_SECRET = secret;
  delete process.env.RAZORPAY_KEY_ID; // gateway cross-check stays skipped/offline
  const paymentController = fresh("controller/payment");

  const signature = crypto
    .createHmac("sha256", secret)
    .update("order_test_1|pay_ok_1")
    .digest("hex");

  const { req, res } = makeReqRes();
  req.body = {
    paymentReference: "REF1",
    razorpay_order_id: "order_test_1",
    razorpay_payment_id: "pay_ok_1",
    razorpay_signature: signature,
  };

  await paymentController.confirmPayment(req, res);

  assert.equal(res.sent.success, true);
  assert.equal(res.sent.status, "verified");
  assert.equal(res.sent.transactionId, "pay_ok_1");
  assert.equal(res.sent.amount, 250);
  assert.equal(callLog.attemptSavedStatus, "verified", "verified attempt must be persisted");
});

test("confirmPayment: rejects a forged signature and fails the attempt", async () => {
  const callLog = {};
  installBookingControllerMocks(callLog, { paymentAttempt: { status: "pending" } });
  process.env.RAZORPAY_KEY_SECRET = "test-secret-payments";
  const paymentController = fresh("controller/payment");

  const { req, res, status } = makeReqRes();
  req.body = {
    paymentReference: "REF1",
    razorpay_order_id: "order_test_1",
    razorpay_payment_id: "pay_forged",
    razorpay_signature: "0".repeat(64), // right length, wrong HMAC
  };

  await paymentController.confirmPayment(req, res);

  assert.equal(status(), 400);
  assert.equal(callLog.attemptSavedStatus, "failed"); // attempt was marked failed + saved
});

test("addbooking: ignores a spoofed body customerId, books for req.userId against the verified payment", async () => {
  const callLog = {};
  installBookingControllerMocks(callLog); // default = verified attempt REF1 bound to hold H1
  // Controllers must re-load AFTER the model mocks so they capture them.
  fresh("controller/payment");
  const bookingController = fresh("controller/booking");

  const { req, res } = makeReqRes();
  req.body = {
    customerId: "attacker-account-id", // must be ignored — context lives in the attempt
    paymentReference: "REF1",
    holdId: "H1",
    passengerDetails: [
      { name: "Rider One", age: 30, gender: "male" },
      { name: "Rider Two", age: 28, gender: "female" },
    ],
    phoneNumber: "9876543210",
    fare: 1, // must be overridden by the verified amount
  };

  await bookingController.addbooking(req, res);

  assert.ok(callLog.bookingCreate, "Booking.create must be called");
  assert.equal(callLog.bookingCreate.customerId, "user123");
  assert.equal(callLog.bookingCreate.fare, 250, "fare must come from the verified payment");
  assert.equal(callLog.bookingCreate.holdId, "H1");
  assert.deepEqual(callLog.bookingCreate.seats, [1, 2]);
  assert.equal(callLog.bookingCreate.status, "ticket_confirmed");
  // Hold rows were converted under this payment's pending key…
  assert.equal(callLog.confirmHolds.pendingKey, "pending:REF1");
  // …re-pointed to the new booking id…
  assert.equal(callLog.repointRows.bookingId, "bk1");
  // …and the payment was consumed exactly once.
  assert.deepEqual(callLog.paymentConsume.filter, { _id: "pa1", status: "verified" });
  assert.equal(res.sent.pnr, callLog.bookingCreate.pnr);
});

test("addbooking: rejects a paymentReference that was never verified (400)", async () => {
  const callLog = {};
  installBookingControllerMocks(callLog, { paymentAttempt: null }); // findOne -> null
  fresh("controller/payment");
  const bookingController = fresh("controller/booking");

  const { req, res, status } = makeReqRes();
  req.body = {
    busId: "bus1",
    seats: [1],
    departureDetails: { date: "2026-08-20" },
    paymentReference: "REF-NOT-VERIFIED",
    holdId: "H1",
  };

  await bookingController.addbooking(req, res);

  assert.equal(status(), 400);
  assert.equal(callLog.bookingCreate, undefined, "no booking may be created for an unverified payment");
});

test("getBooking: only returns the authenticated user's own bookings", async () => {
  const callLog = {};
  installBookingControllerMocks(callLog, { bookings: [{ _id: "bk1", customerId: "user123" }] });
  const bookingController = fresh("controller/booking");

  const { req, res } = makeReqRes();
  req.params = { id: "someone-else" }; // URL id is ignored

  await bookingController.getBooking(req, res);

  assert.deepEqual(callLog.find, { customerId: "user123" });
  assert.equal(res.sent.length, 1);
  assert.equal(res.sent[0].customerId, "user123");
});

// ---------------------------------------------------------------------------
// Seat-locking / double-booking protection must be unchanged
// ---------------------------------------------------------------------------

function installSeatLockMocks({ findOneAndUpdateResult, existingLock }) {
  const SeatLock = {};
  SeatLock.findOneAndUpdate = async () => findOneAndUpdateResult;
  SeatLock.findOne = () => chainOne(existingLock);
  SeatLock.updateOne = async () => ({});
  mockModule("models/seatLock", SeatLock);
  mockModule("models/booking", {
    find: () => chainOne([]),
  });
  return fresh("controller/seatReservation");
}

test("seat reservation: free seats are reserved atomically", async () => {
  const seatReservation = installSeatLockMocks({ findOneAndUpdateResult: { bookedSeats: [1, 2] } });
  const result = await seatReservation.reserveSeatsAtomically("bus1", "2026-08-20", [1, 2]);
  assert.deepEqual(result, { success: true });
});

test("seat reservation: already-taken seats still conflict (double-booking blocked)", async () => {
  const seatReservation = installSeatLockMocks({
    findOneAndUpdateResult: null, // $nin filter matched nothing → conflict
    existingLock: { bookedSeats: [2, 3] },
  });
  const result = await seatReservation.reserveSeatsAtomically("bus1", "2026-08-20", [2]);
  assert.equal(result.success, false);
  assert.deepEqual(result.conflictingSeats, [2]);
});
