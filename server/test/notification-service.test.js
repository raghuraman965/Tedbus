// Backend notification-service tests.
//
// Verifies, without a database, that the notification service:
//   1. persists notifications (create -> stored record) and records per-channel
//      delivery status (sent / failed / disabled + error + attemptCount),
//   2. deduplicates via dedupKey,
//   3. handles a missing SMTP config by marking the email channel failed
//      (never throws), so booking creation can't break because of email,
//   4. wires the business triggers (booking confirmed/cancelled, journey
//      reminder, offer promo, bus delayed) into createNotification,
//   5. bridges community events into the unified feed with the correct
//      mappings (like/comment/reply -> community_activity, and
//      verification_approved/system -> account with the message passed through
//      params.detail).
//
// No database is needed: mongoose models are swapped for in-memory fakes via
// require-cache injection BEFORE the module under test is loaded (same pattern
// as booking-auth.test.js). Real model files must never be required more than
// once per process (mongoose throws OverwriteModelError), so their caches are
// deliberately never deleted.

const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");

// No real .env is loaded here; provide minimal env so module loading is
// side-effect free. VAPID keys avoid writing server/.vapid-keys.json. SMTP is
// intentionally left unset so email failure handling is exercised.
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-notifications";
process.env.VAPID_PUBLIC_KEY = "test-vapid-public-key";
process.env.VAPID_PRIVATE_KEY = "test-vapid-private-key";
delete process.env.SMTP_HOST;
delete process.env.SMTP_USER;
delete process.env.SMTP_PASS;
delete process.env.SMTP_PORT;

const SERVER = path.join(__dirname, "..");

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

// Chainable mongoose-query fake: supports .lean().sort().skip().limit().exec().
function chain(result) {
  const q = {};
  q.lean = () => q;
  q.sort = () => q;
  q.skip = () => q;
  q.limit = () => q;
  q.exec = async () => result;
  return q;
}

function setNested(obj, dottedPath, value) {
  const parts = dottedPath.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur[parts[i]] === undefined) cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

function getNested(obj, dottedPath) {
  let cur = obj;
  for (const part of String(dottedPath).split(".")) {
    if (cur === undefined || cur === null) return undefined;
    cur = cur[part];
  }
  return cur;
}

/** Filter matcher that supports dotted paths, $lt and $in (used by the
 *  automatic-retry sweep and the journey-reminder booking query). */
function matchesFilter(doc, filter) {
  return Object.entries(filter).every(([k, v]) => {
    const actual = getNested(doc, k);
    if (v && typeof v === "object" && typeof v.$lt !== "undefined") {
      return actual !== undefined && actual !== null && actual < v.$lt;
    }
    if (v && typeof v === "object" && Array.isArray(v.$in)) {
      return v.$in.some((x) => String(actual) === String(x));
    }
    return String(actual) === String(v);
  });
}

const TYPE_ENUM = [
  "booking_confirmed",
  "booking_cancelled",
  "journey_reminder",
  "bus_delayed",
  "bus_rescheduled",
  "offer",
  "coupon",
  "community_activity",
  "review_reply",
  "account",
];

const notifStore = [];
const notifModel = {
  schema: { paths: { type: { enumValues: TYPE_ENUM } } },
  store: notifStore,
  create(doc) {
    const full = { _id: `n${notifStore.length + 1}`, read: false, createdAt: new Date(), ...doc };
    notifStore.push(full);
    return { ...full, toObject: () => ({ ...full }) };
  },
  findOne(filter = {}) {
    return chain(notifStore.find((d) => matchesFilter(d, filter)) || null);
  },
  findById(id) {
    return chain(notifStore.find((d) => String(d._id) === String(id)) || null);
  },
  find(filter = {}) {
    return chain(notifStore.filter((d) => matchesFilter(d, filter)));
  },
  async updateOne(filter, update) {
    const doc = notifStore.find((d) =>
      Object.entries(filter).every(([k, v]) => String(d[k]) === String(v))
    );
    if (doc && update.$set) {
      for (const [k, v] of Object.entries(update.$set)) setNested(doc, k, v);
    }
  },
  async countDocuments() {
    return notifStore.length;
  },
};

function makePrefs(userId, overrides = {}) {
  return {
    userId,
    locale: "en",
    channels: { inapp: true, email: true, push: true },
    categories: {
      booking: true,
      journey: true,
      bus: true,
      offers: true,
      community: true,
      reviews: true,
      account: true,
    },
    ...overrides,
  };
}

const prefsStore = new Map();
const prefsModel = {
  store: prefsStore,
  findOne({ userId }) {
    return chain(prefsStore.get(userId) || null);
  },
  create({ userId }) {
    const p = makePrefs(userId);
    prefsStore.set(userId, p);
    return { toObject: () => p };
  },
};

const pushModel = {
  find() {
    return chain([]);
  },
  async deleteMany() {},
};

const customers = [
  { _id: "c1", name: "Alice", email: "alice@tedbus.test" },
  { _id: "c2", name: "Bob", email: "bob@tedbus.test" },
];
const customerModel = {
  findById(id) {
    return chain(customers.find((c) => String(c._id) === String(id)) || null);
  },
  find() {
    return chain(customers);
  },
};

const bookings = [];
const bookingModel = {
  store: bookings,
  find() {
    return chain(bookings);
  },
};

mockModule("models/notification", notifModel);
mockModule("models/notificationPreference", prefsModel);
mockModule("models/pushSubscription", pushModel);
mockModule("models/customer", customerModel);
mockModule("models/booking", bookingModel);
mockModule("services/socket", { emitToUser: async () => {} });

const svc = fresh("services/notificationService");

function bookingFixture(overrides = {}) {
  return {
    _id: "b1",
    customerId: "c1",
    pnr: "TEDTEST1",
    fare: 499,
    seats: [12, 13],
    email: "alice@tedbus.test",
    departureDetails: { city: "Chennai", date: "2026-08-14", time: 10 },
    arrivalDetails: { city: "Bangalore", date: "2026-08-14", time: 16 },
    ...overrides,
  };
}

const yyyymmdd = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// ---------------------------------------------------------------------------
// Booking triggers
// ---------------------------------------------------------------------------

test("notifyBookingConfirmed persists a booking_confirmed notification with channel status", async () => {
  const n = await svc.notifyBookingConfirmed(bookingFixture());
  assert.ok(n);
  assert.equal(n.type, "booking_confirmed");
  assert.equal(n.category, "booking");
  assert.equal(n.channels.inapp.status, "sent");
  assert.equal(n.channels.inapp.attemptCount, 1);
  assert.equal(n.channels.email.status, "disabled");
  assert.equal(n.channels.push.status, "failed");
  assert.match(n.message, /Chennai → Bangalore/);
  const stored = notifModel.store.find((d) => d._id === n._id);
  assert.ok(stored, "notification should be persisted in the store");
});

test("notifyBookingCancelled marks the email channel failed when SMTP is not configured", async () => {
  const n = await svc.notifyBookingCancelled(bookingFixture());
  assert.equal(n.type, "booking_cancelled");
  assert.equal(n.category, "booking");
  assert.equal(n.channels.inapp.status, "sent");
  assert.equal(n.channels.email.status, "failed");
  assert.match(n.channels.email.error, /SMTP not configured/);
  assert.equal(n.channels.email.attemptCount, 1);
});

// ---------------------------------------------------------------------------
// Journey reminders
// ---------------------------------------------------------------------------

test("sendJourneyReminders notifies upcoming departures and deduplicates", async () => {
  const now = new Date();
  const soon = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const b = bookingFixture({
    _id: "b-reminder",
    customerId: "c1",
    departureDetails: { city: "Chennai", date: yyyymmdd(soon), time: soon.getHours() },
  });
  bookings.push(b);

  const sent = await svc.sendJourneyReminders();
  assert.equal(sent, 1);

  const n = notifModel.store.find((d) => d.type === "journey_reminder");
  assert.ok(n);
  assert.equal(n.category, "journey");
  assert.equal(n.channels.inapp.status, "sent");
  assert.match(n.message, /Chennai → Bangalore/);

  const before = notifModel.store.filter((d) => d.type === "journey_reminder").length;
  await svc.sendJourneyReminders();
  const after = notifModel.store.filter((d) => d.type === "journey_reminder").length;
  assert.equal(after, before, "second run must not create a duplicate reminder");
});

// ---------------------------------------------------------------------------
// Promotional + bus alerts
// ---------------------------------------------------------------------------

test("sendOfferToUsers persists an offer notification for every target customer", async () => {
  const created = await svc.sendOfferToUsers({
    title: "Flat 20% off",
    message: "Save big on your next trip",
    promoCode: "SAVE20",
    segment: "all",
  });
  assert.equal(created, customers.length);
  const offers = notifModel.store.filter((d) => d.type === "offer");
  assert.equal(offers.length, customers.length);
  assert.ok(offers.every((o) => o.category === "offers"));
  assert.ok(offers.every((o) => o.channels.inapp.status === "sent"));
});

test("notifyBusStatusChange alerts every booking on the bus/date", async () => {
  bookings.push(
    bookingFixture({
      _id: "b-bus",
      busId: "bus1",
      customerId: "c2",
      departureDetails: { city: "Chennai", date: "2030-01-01", time: 10 },
    })
  );
  const created = await svc.notifyBusStatusChange({
    busId: "bus1",
    busName: "Express",
    kind: "delayed",
    delayMinutes: 30,
    date: "2030-01-01",
  });
  assert.equal(created, 1);
  const n = notifModel.store.find((d) => d.type === "bus_delayed");
  assert.ok(n);
  assert.equal(n.category, "bus");
  assert.match(n.message, /delayed by 30 minutes/);
});

// ---------------------------------------------------------------------------
// Community bridge
// ---------------------------------------------------------------------------

test("bridgeCommunityNotification maps like -> community_activity (not reviews)", async () => {
  const n = await svc.bridgeCommunityNotification({
    userId: "c1",
    actorUserId: "c2",
    type: "like",
    postId: "p1",
    message: "liked your post.",
  });
  assert.ok(n);
  assert.equal(n.category, "community");
  assert.equal(n.type, "community_activity");
  assert.equal(n.message, "Bob liked your post.");
});

test("bridgeCommunityNotification maps comment reply -> community_activity, never review_reply", async () => {
  const n = await svc.bridgeCommunityNotification({
    userId: "c1",
    actorUserId: "c2",
    type: "reply",
    postId: "p1",
    commentId: "cm1",
    message: "replied to a comment on your post.",
  });
  assert.equal(n.type, "community_activity");
  assert.notEqual(n.type, "review_reply");
  assert.match(n.message, /replied to a comment on your post/);
});

test("bridgeCommunityNotification maps verification_approved -> account with the message", async () => {
  const n = await svc.bridgeCommunityNotification({
    userId: "c2",
    actorUserId: null,
    type: "verification_approved",
    message: "Your community verification was approved. You can now create posts.",
  });
  assert.equal(n.category, "account");
  assert.equal(n.type, "account");
  assert.equal(n.message, "Your community verification was approved. You can now create posts.");
});

test("bridgeCommunityNotification maps system -> account with the message", async () => {
  const n = await svc.bridgeCommunityNotification({
    userId: "c2",
    actorUserId: null,
    type: "system",
    message: "Your account has been suspended.",
  });
  assert.equal(n.category, "account");
  assert.equal(n.type, "account");
  assert.equal(n.message, "Your account has been suspended.");
});

test("bridgeCommunityNotification ignores self-activity", async () => {
  const n = await svc.bridgeCommunityNotification({
    userId: "c1",
    actorUserId: "c1",
    type: "like",
    postId: "p1",
  });
  assert.equal(n, null);
});

// ---------------------------------------------------------------------------
// Preferences + dedup
// ---------------------------------------------------------------------------

test("createNotification records email as disabled when the user's preference disables it", async () => {
  prefsStore.set("c-disabled", makePrefs("c-disabled", { channels: { inapp: true, email: false, push: true } }));
  const n = await svc.createNotification({
    userId: "c-disabled",
    category: "bus",
    type: "bus_rescheduled",
    params: { busName: "Express", route: "Chennai → Bangalore", date: "2026-08-14", newTime: "12:00 PM" },
    dedupKey: "pref-email-disabled",
  });
  assert.equal(n.channels.email.status, "disabled");
  assert.equal(n.channels.inapp.status, "sent");
});

test("createNotification deduplicates on dedupKey", async () => {
  const params = { route: "Chennai → Bangalore", date: "2026-08-14", time: "10:00 AM", hoursBefore: 3 };
  const first = await svc.createNotification({
    userId: "c2",
    category: "journey",
    type: "journey_reminder",
    params,
    dedupKey: "dedup-same-key",
  });
  const second = await svc.createNotification({
    userId: "c2",
    category: "journey",
    type: "journey_reminder",
    params,
    dedupKey: "dedup-same-key",
  });
  assert.equal(String(second._id), String(first._id));
  assert.equal(notifModel.store.filter((d) => d.dedupKey === "dedup-same-key").length, 1);
});

// ---------------------------------------------------------------------------
// Journey reminder window
// ---------------------------------------------------------------------------

test("sendJourneyReminders does not remind departures farther than 3 hours away", async () => {
  const far = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  bookings.push(
    bookingFixture({
      _id: "b-far",
      customerId: "c1",
      departureDetails: { city: "Chennai", date: yyyymmdd(far), time: far.getHours() },
    })
  );
  const key = "journey_reminder_b-far";
  const before = notifModel.store.filter((d) => d.dedupKey === key).length;
  await svc.sendJourneyReminders();
  const after = notifModel.store.filter((d) => d.dedupKey === key).length;
  assert.equal(after, before, "a booking 2 days out must not receive a reminder yet");
});

// ---------------------------------------------------------------------------
// Automatic retry (bounded + delay-gated)
// ---------------------------------------------------------------------------

test("retryFailedChannels retries an eligible failed channel and bumps attemptCount", async () => {
  const base = await svc.createNotification({
    userId: "c1",
    category: "account",
    type: "account",
    params: { detail: "retry me" },
    dedupKey: "retry-email-1",
  });
  const id = String(base._id);
  const doc = notifModel.store.find((d) => String(d._id) === id);
  doc.channels.email.status = "failed";
  doc.channels.email.attemptCount = 1;
  doc.channels.email.error = "SMTP not configured...";
  doc.channels.email.retriedAt = new Date(Date.now() - 20 * 60 * 1000); // eligible (older than the delay)

  const retried = await svc.retryFailedChannels();
  assert.ok(retried >= 1, "an eligible failed channel should be retried");
  const afterFirst = notifModel.store.find((d) => String(d._id) === id);
  assert.equal(afterFirst.channels.email.attemptCount, 2, "attemptCount should bump to 2");
  assert.equal(afterFirst.channels.email.status, "failed", "still fails: SMTP not configured");

  const retriedAgain = await svc.retryFailedChannels();
  const afterSecond = notifModel.store.find((d) => String(d._id) === id);
  assert.equal(afterSecond.channels.email.attemptCount, 2, "a run inside the retry delay must be skipped");
  assert.equal(retriedAgain, 0, "no retries allowed inside the retry delay window");
});

test("retryFailedChannels never retries past the max attempt cap", async () => {
  const base = await svc.createNotification({
    userId: "c1",
    category: "account",
    type: "account",
    params: { detail: "max out" },
    dedupKey: "retry-email-max",
  });
  const id = String(base._id);
  const doc = notifModel.store.find((d) => String(d._id) === id);
  doc.channels.email.status = "failed";
  doc.channels.email.attemptCount = svc.MAX_RETRY_ATTEMPTS; // at the cap
  doc.channels.email.error = "SMTP not configured...";
  doc.channels.email.retriedAt = new Date(Date.now() - 20 * 60 * 1000);

  const retried = await svc.retryFailedChannels();
  const after = notifModel.store.find((d) => String(d._id) === id);
  assert.equal(after.channels.email.attemptCount, svc.MAX_RETRY_ATTEMPTS, "attempts must stay at the cap");
  assert.equal(retried, 0, "a channel at the max attempt cap must not be retried");
});
