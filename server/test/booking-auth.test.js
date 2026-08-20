// Backend booking-authentication tests.
//
// Verifies the two flows the frontend relies on:
//   1. A guest (no/invalid JWT) is REJECTED by the payment-verification and
//      booking-creation endpoints (401) and cannot read other users' bookings.
//   2. A logged-in user can verify payment and create a booking, and the
//      customerId used is always the one from the verified JWT — never the
//      value smuggled in the request body (no account spoofing).
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

test("booking routes: payment verification + creation + listing require auth", () => {
  const bookingRoutes = fresh("routes/booking");
  // routes/booking loaded the controller already; require() returns the same
  // cached instance so handler identity can be compared directly.
  const bookingController = require("../controller/booking");

  const paymentHandlers = routeHandles(bookingRoutes, "/booking/verify-payment", "post");
  assert.equal(paymentHandlers.length, 2, "verify-payment must have exactly 2 handlers");
  assert.equal(paymentHandlers[0].name, "requireAuth", "verify-payment must be behind requireAuth");
  assert.equal(paymentHandlers[1], bookingController.verifyPayment);

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
  Booking.updateOne = async () => ({});

  const PaymentAttempt = {};
  PaymentAttempt.findOne = () => chainOne(overrides.paymentAttempt ?? null);
  PaymentAttempt.create = async (data) => {
    callLog.paymentCreate = data;
    return { _id: "pa1", ...data, createdAt: new Date() };
  };
  PaymentAttempt.updateOne = async () => ({});

  mockModule("models/booking", Booking);
  mockModule("models/bus", {
    findById: () => chainOne({
      operatorName: "Test Lines",
      busType: "sleeper",
      images: "",
      departureTime: "08:00",
    }),
  });
  mockModule("models/paymentAttempt", PaymentAttempt);
  mockModule("controller/seatReservation", {
    reserveSeatsAtomically: async () => ({ success: true }),
    releaseSeats: async () => {},
    getSoldSeats: async () => [],
  });
  mockModule("services/notificationService", {
    notifyBookingConfirmed: async () => {},
    notifyBookingCancelled: async () => {},
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

test("verifyPayment: ignores a spoofed body customerId and uses req.userId", async () => {
  const callLog = {};
  installBookingControllerMocks(callLog);
  const bookingController = fresh("controller/booking");

  const { req, res } = makeReqRes();
  req.body = {
    paymentReference: "REF1",
    customerId: "attacker-account-id", // must be ignored
    amount: 250,
    method: "upi",
  };

  await bookingController.verifyPayment(req, res);

  assert.ok(callLog.paymentCreate, "PaymentAttempt.create must be called");
  assert.equal(callLog.paymentCreate.customerId, "user123");
  assert.equal(callLog.paymentCreate.paymentReference, "REF1");
  assert.equal(res.sent.success, true);
});

test("addbooking: ignores a spoofed body customerId and books for req.userId", async () => {
  const callLog = {};
  installBookingControllerMocks(callLog, {
    paymentAttempt: {
      status: "verified",
      amount: 250,
      transactionId: "TXN1",
      expiresAt: new Date(Date.now() + 60000),
      createdAt: new Date(),
    },
  });
  const bookingController = fresh("controller/booking");

  const { req, res } = makeReqRes();
  req.body = {
    customerId: "attacker-account-id", // must be ignored
    busId: "bus1",
    seats: [1, 2],
    departureDetails: { city: "A", date: "2026-08-20" },
    paymentReference: "REF1",
    fare: 1, // must be overridden by the verified amount
  };

  await bookingController.addbooking(req, res);

  assert.ok(callLog.bookingCreate, "Booking.create must be called");
  assert.equal(callLog.bookingCreate.customerId, "user123");
  assert.equal(callLog.bookingCreate.fare, 250, "fare must come from the verified payment");
  assert.equal(res.sent.pnr, callLog.bookingCreate.pnr);
});

test("addbooking: rejects a paymentReference that was never verified (400)", async () => {
  const callLog = {};
  installBookingControllerMocks(callLog); // PaymentAttempt.findOne -> null
  const bookingController = fresh("controller/booking");

  const { req, res, status } = makeReqRes();
  req.body = {
    busId: "bus1",
    seats: [1],
    departureDetails: { date: "2026-08-20" },
    paymentReference: "REF-NOT-VERIFIED",
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
