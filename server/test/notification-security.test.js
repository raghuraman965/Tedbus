// Backend notification-controller security tests.
//
// Verifies, without a database, that every customer notification endpoint is
// scoped to the authenticated user (req.userId) — i.e. no IDOR:
//   - listing/unread-count return only the caller's records,
//   - viewing/marking/deleting/retrying a notification owned by someone else
//     returns 404 (the record is looked up by {_id, userId}, so a foreign id
//     never matches),
//   - mark-all-read and preferences only touch the caller's own data.
//
// The controllers are exercised directly with mocked models (require-cache
// injection, same pattern as the other backend test files). The route layer
// (middleware/auth.js requireAuth) is not exercised here — that is verified by
// boot/route inspection and the auth tests.

const path = require("path");
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-security";

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

// Chainable mongoose-query fake. Mongoose queries are thenable, so the fake is
// too: controllers both await `.findOne(...)` directly and use `.lean().exec()`.
function chain(result) {
  const q = {};
  q.lean = () => q;
  q.sort = () => q;
  q.skip = () => q;
  q.limit = () => q;
  q.exec = async () => result;
  q.then = (onFulfilled) => Promise.resolve(result).then(onFulfilled);
  return q;
}

beforeEach(() => {
  store.length = 0;
  prefsStore.clear();
});

function getNested(obj, dottedPath) {
  let cur = obj;
  for (const part of String(dottedPath).split(".")) {
    if (cur === undefined || cur === null) return undefined;
    cur = cur[part];
  }
  return cur;
}

function matchesFilter(doc, filter) {
  return Object.entries(filter).every(([k, v]) => {
    const actual = getNested(doc, k);
    if (v && typeof v === "object" && typeof v.$lt !== "undefined") {
      return actual !== undefined && actual !== null && actual < v.$lt;
    }
    return String(actual) === String(v);
  });
}

const store = [];
function mk(id, userId, extra = {}) {
  const doc = {
    _id: id,
    userId,
    read: false,
    readAt: null,
    title: "t",
    message: "m",
    category: "account",
    type: "account",
    createdAt: new Date(),
    ...extra,
  };
  store.push(doc);
  return doc;
}

const notifModel = {
  store,
  findOne(filter = {}) {
    return chain(store.find((d) => matchesFilter(d, filter)) || null);
  },
  findOneAndUpdate(filter, update) {
    const d = store.find((x) => matchesFilter(x, filter));
    if (!d) return chain(null);
    const updated = { ...d, ...(update.$set || {}) };
    store[store.indexOf(d)] = updated;
    return chain(updated);
  },
  findOneAndDelete(filter) {
    const idx = store.findIndex((x) => matchesFilter(x, filter));
    if (idx === -1) return chain(null);
    const [removed] = store.splice(idx, 1);
    return chain(removed);
  },
  updateMany(filter, update) {
    const targets = store.filter((d) => matchesFilter(d, filter));
    for (const d of targets) Object.assign(d, update.$set || {});
    return { modifiedCount: targets.length };
  },
  countDocuments(filter = {}) {
    return store.filter((d) => matchesFilter(d, filter)).length;
  },
  find(filter = {}) {
    return chain(store.filter((d) => matchesFilter(d, filter)));
  },
};

function makePrefDoc(userId) {
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
    createdAt: new Date(),
    updatedAt: new Date(),
    async save() {
      this.updatedAt = new Date();
      return this;
    },
  };
}

const prefsStore = new Map();
const prefsModel = {
  findOne({ userId }) {
    return chain(prefsStore.get(userId) || null);
  },
  create({ userId }) {
    const doc = makePrefDoc(userId);
    prefsStore.set(userId, doc);
    return Promise.resolve({ toObject: () => doc });
  },
};

const pushModel = {
  findOneAndUpdate: async () => ({}),
  deleteMany: async () => ({}),
};

mockModule("models/notification", notifModel);
mockModule("models/notificationPreference", prefsModel);
mockModule("models/pushSubscription", pushModel);
mockModule("services/notificationService", {
  retryChannel: async () => ({ ok: false, error: "Notification not found." }),
  LOCALES: ["en", "hi", "ta", "te", "kn", "ml"],
});

const ctrl = fresh("controller/notification");

function makeReq(overrides = {}) {
  return {
    userId: "u1",
    params: {},
    query: {},
    body: {},
    headers: {},
    get: () => undefined,
    ...overrides,
  };
}

function makeRes() {
  const res = { _status: 200, _body: null };
  res.status = (s) => {
    res._status = s;
    return res;
  };
  res.json = (b) => {
    res._body = b;
    return res;
  };
  return res;
}

// ---------------------------------------------------------------------------
// Listing / counting
// ---------------------------------------------------------------------------

test("getNotifications scopes results to the authenticated user", async () => {
  mk("n1", "u1");
  mk("n2", "u2");
  const res = makeRes();
  await ctrl.getNotifications(makeReq({ userId: "u1" }), res);
  assert.equal(res._status, 200);
  const items = res._body.items;
  assert.ok(items.some((n) => n._id === "n1"));
  assert.ok(!items.some((n) => n._id === "n2"), "must not leak another user's notifications");
});

test("getUnreadCount counts only the caller's unread notifications", async () => {
  mk("a1", "u1");
  mk("a2", "u1");
  mk("a3", "u2");
  const res = makeRes();
  await ctrl.getUnreadCount(makeReq({ userId: "u1" }), res);
  assert.equal(res._body.count, 2);
});

// ---------------------------------------------------------------------------
// Single-record operations must reject foreign ownership (IDOR)
// ---------------------------------------------------------------------------

test("getNotification refuses another user's notification (404)", async () => {
  mk("n-secret", "u2");
  const res = makeRes();
  await ctrl.getNotification(makeReq({ userId: "u1", params: { id: "n-secret" } }), res);
  assert.equal(res._status, 404);
});

test("markRead refuses to mark another user's notification read (404)", async () => {
  mk("n-secret", "u2");
  const res = makeRes();
  await ctrl.markRead(makeReq({ userId: "u1", params: { id: "n-secret" } }), res);
  assert.equal(res._status, 404);
  assert.equal(store.find((d) => d._id === "n-secret").read, false);
});

test("deleteNotification refuses to delete another user's notification (404)", async () => {
  mk("n-secret", "u2");
  const res = makeRes();
  await ctrl.deleteNotification(makeReq({ userId: "u1", params: { id: "n-secret" } }), res);
  assert.equal(res._status, 404);
  assert.ok(store.some((d) => d._id === "n-secret"), "other user's notification must remain");
});

test("retryNotification refuses to retry another user's notification (404)", async () => {
  mk("n-secret", "u2");
  const res = makeRes();
  await ctrl.retryNotification(
    makeReq({ userId: "u1", params: { id: "n-secret" }, body: { channel: "email" } }),
    res
  );
  assert.equal(res._status, 404);
});

// ---------------------------------------------------------------------------
// Bulk operations / preferences are scoped too
// ---------------------------------------------------------------------------

test("markAllRead only marks the caller's notifications read", async () => {
  mk("b1", "u1");
  mk("b2", "u1");
  mk("b3", "u2");
  const res = makeRes();
  await ctrl.markAllRead(makeReq({ userId: "u1" }), res);
  assert.equal(res._body.updated, 2);
  assert.equal(store.find((d) => d._id === "b1").read, true);
  assert.equal(store.find((d) => d._id === "b3").read, false, "must not touch another user's notifications");
});

test("getPreferences returns only the caller's preferences", async () => {
  prefsStore.set("u1", makePrefDoc("u1"));
  prefsStore.set("u2", makePrefDoc("u2"));
  const res = makeRes();
  await ctrl.getPreferences(makeReq({ userId: "u1" }), res);
  assert.equal(res._status, 200);
  assert.equal(res._body.userId, "u1");
});

test("updatePreferences only updates the caller's preferences", async () => {
  prefsStore.set("u1", makePrefDoc("u1"));
  prefsStore.set("u2", makePrefDoc("u2"));
  const res = makeRes();
  await ctrl.updatePreferences(makeReq({ userId: "u1", body: { channels: { email: false } } }), res);
  assert.equal(res._status, 200);
  assert.equal(prefsStore.get("u1").channels.email, false);
  assert.equal(prefsStore.get("u2").channels.email, true, "another user's preferences must not change");
});
