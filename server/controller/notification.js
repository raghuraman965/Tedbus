const Notification = require("../models/notification");
const NotificationPreference = require("../models/notificationPreference");
const PushSubscription = require("../models/pushSubscription");
const svc = require("../services/notificationService");
const { tReq } = require("../services/i18n");
const { CATEGORIES: NOTIF_CATEGORIES } = require("../models/notification");

exports.getNotifications = async (req, res) => {
  try {
    const userId = req.userId;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const { category, type, read, lang } = req.query;

    const filter = { userId };
    if (category) filter.category = category;
    if (type) filter.type = type;
    if (read === "true") filter.read = true;
    else if (read === "false") filter.read = false;

    const [total, unreadTotal, items] = await Promise.all([
      Notification.countDocuments(filter),
      Notification.countDocuments({ userId, read: false }),
      Notification.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
    ]);

    res.json({
      items,
      total,
      unread: unreadTotal,
      page,
      limit,
      hasMore: page * limit < total,
    });
  } catch (err) {
    console.error("[notifications] getNotifications error:", err.message);
    res.status(500).json({ error: tReq(req, "notification.errLoad") });
  }
};

exports.getUnreadCount = async (req, res) => {
  try {
    const count = await Notification.countDocuments({ userId: req.userId, read: false });
    res.json({ count });
  } catch (err) {
    console.error("[notifications] getUnreadCount error:", err.message);
    res.status(500).json({ error: tReq(req, "notification.errUnread") });
  }
};

exports.getNotification = async (req, res) => {
  try {
    const notif = await Notification.findOne({ _id: req.params.id, userId: req.userId })
      .lean()
      .exec();
    if (!notif) return res.status(404).json({ error: tReq(req, "notification.notFound") });
    res.json(notif);
  } catch (err) {
    console.error("[notifications] getNotification error:", err.message);
    res.status(500).json({ error: tReq(req, "notification.errLoadOne") });
  }
};

exports.markRead = async (req, res) => {
  try {
    const notif = await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      { $set: { read: true, readAt: new Date() } },
      { new: true }
    ).lean();
    if (!notif) return res.status(404).json({ error: tReq(req, "notification.notFound") });
    res.json(notif);
  } catch (err) {
    console.error("[notifications] markRead error:", err.message);
    res.status(500).json({ error: tReq(req, "notification.errUpdate") });
  }
};

exports.markAllRead = async (req, res) => {
  try {
    const result = await Notification.updateMany(
      { userId: req.userId, read: false },
      { $set: { read: true, readAt: new Date() } }
    );
    res.json({ updated: result.modifiedCount });
  } catch (err) {
    console.error("[notifications] markAllRead error:", err.message);
    res.status(500).json({ error: tReq(req, "notification.errAllRead") });
  }
};

exports.deleteNotification = async (req, res) => {
  try {
    const notif = await Notification.findOneAndDelete({ _id: req.params.id, userId: req.userId }).lean();
    if (!notif) return res.status(404).json({ error: tReq(req, "notification.notFound") });
    res.json({ deleted: true });
  } catch (err) {
    console.error("[notifications] deleteNotification error:", err.message);
    res.status(500).json({ error: tReq(req, "notification.errDelete") });
  }
};

exports.retryNotification = async (req, res) => {
  try {
    const { channel } = req.body || {};
    const notif = await Notification.findOne({ _id: req.params.id, userId: req.userId }).lean();
    if (!notif) return res.status(404).json({ error: tReq(req, "notification.notFound") });
    const result = await svc.retryChannel(req.params.id, channel);
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json(result);
  } catch (err) {
    console.error("[notifications] retryNotification error:", err.message);
    res.status(500).json({ error: tReq(req, "notification.errRetry") });
  }
};

exports.getPreferences = async (req, res) => {
  try {
    let prefs = await NotificationPreference.findOne({ userId: req.userId }).lean().exec();
    if (!prefs) {
      prefs = await NotificationPreference.create({ userId: req.userId }).then((d) => d.toObject());
    }
    res.json(prefs);
  } catch (err) {
    console.error("[notifications] getPreferences error:", err.message);
    res.status(500).json({ error: tReq(req, "notification.errPreferences") });
  }
};

exports.updatePreferences = async (req, res) => {
  try {
    const { locale, channels, categories, promotionalOptIn, reminderTiers } = req.body || {};
    let prefs = await NotificationPreference.findOne({ userId: req.userId });
    if (!prefs) {
      prefs = new NotificationPreference({ userId: req.userId });
    }
    if (locale && svc.LOCALES.includes(locale)) prefs.locale = locale;
    if (channels && typeof channels === "object") {
      for (const ch of ["inapp", "email", "push"]) {
        if (typeof channels[ch] === "boolean") prefs.channels[ch] = channels[ch];
      }
    }
    // Per-category-per-channel preferences: categories[cat] can be a boolean
    // (legacy shorthand) or an object { enabled, inapp, email, push }.
    if (categories && typeof categories === "object") {
      for (const [cat, val] of Object.entries(categories)) {
        if (!NOTIF_CATEGORIES.includes(cat)) continue;
        if (!prefs.categories) prefs.categories = {};
        if (typeof val === "boolean") {
          prefs.categories[cat] = prefs.categories[cat] || {};
          prefs.categories[cat].enabled = val;
        } else if (typeof val === "object" && val !== null) {
          const existing = (prefs.categories[cat] && typeof prefs.categories[cat] === "object")
            ? prefs.categories[cat]
            : { enabled: true, inapp: true, email: true, push: true };
          if (typeof val.enabled === "boolean") existing.enabled = val.enabled;
          if (typeof val.inapp === "boolean") existing.inapp = val.inapp;
          if (typeof val.email === "boolean") existing.email = val.email;
          if (typeof val.push === "boolean") existing.push = val.push;
          prefs.categories[cat] = existing;
        }
      }
    }
    if (typeof promotionalOptIn === "boolean") prefs.promotionalOptIn = promotionalOptIn;
    if (Array.isArray(reminderTiers)) {
      const validTiers = ["24h", "6h", "2h", "1h", "30m"];
      prefs.reminderTiers = reminderTiers.filter((t) => validTiers.includes(t));
    }
    prefs.updatedAt = new Date();
    await prefs.save();
    res.json(prefs);
  } catch (err) {
    console.error("[notifications] updatePreferences error:", err.message);
    res.status(500).json({ error: tReq(req, "notification.errUpdatePrefs") });
  }
};

exports.registerPushSubscription = async (req, res) => {
  try {
    const { endpoint, keys } = req.body || {};
    if (!endpoint) return res.status(400).json({ error: tReq(req, "notification.pushEndpointRequired") });
    if (!keys || !keys.p256dh || !keys.auth) {
      return res.status(400).json({ error: tReq(req, "notification.pushKeysRequired") });
    }
    await PushSubscription.findOneAndUpdate(
      { userId: req.userId, endpoint },
      {
        $set: {
          userId: req.userId,
          endpoint,
          keys: { p256dh: keys.p256dh, auth: keys.auth },
          userAgent: req.get("user-agent") || "",
        },
      },
      { upsert: true, new: true }
    );
    console.log(`[push] saved subscription for user ${req.userId}: ${String(endpoint).slice(0, 60)}...`);
    res.json({ ok: true });
  } catch (err) {
    console.error("[push] register subscription error:", err.message);
    res.status(500).json({ error: tReq(req, "notification.errPushRegister") });
  }
};

exports.removePushSubscription = async (req, res) => {
  try {
    const { endpoint } = req.body || {};
    if (!endpoint) return res.status(400).json({ error: tReq(req, "notification.pushEndpointRequired") });
    await PushSubscription.deleteMany({ userId: req.userId, endpoint });
    res.json({ ok: true });
  } catch (err) {
    console.error("[notifications] removePushSubscription error:", err.message);
    res.status(500).json({ error: tReq(req, "notification.errPushRemove") });
  }
};

exports.getPushStatus = async (req, res) => {
  try {
    const count = await PushSubscription.countDocuments({ userId: req.userId });
    res.json({ ok: true, subscribed: count > 0, subscriptionCount: count });
  } catch (err) {
    console.error("[push] getPushStatus error:", err.message);
    res.status(500).json({ ok: false, subscribed: false, subscriptionCount: 0 });
  }
};

// Public (no auth) — the VAPID application server key the browser needs to
// build a PushManager subscription. Served from the server so the key never
// needs to be bundled with the frontend.
exports.getPushPublicKey = async (req, res) => {
  try {
    const { getVapidPublicKey } = require("../utils/vapid");
    const publicKey = getVapidPublicKey();
    res.json({ publicKey });
  } catch (err) {
    console.error("[push] getPushPublicKey error:", err.message);
    res.status(500).json({ error: tReq(req, "notification.errPushConfig") });
  }
};

// Creates a real in-app + push test notification for the logged-in user and
// reports whether the push was delivered to their registered browser(s).
exports.testPush = async (req, res) => {
  try {
    const result = await svc.sendTestPush(req.userId);
    if (result.ok) return res.json(result);
    return res.status(400).json(result);
  } catch (err) {
    console.error("[push] test-push error:", err.message);
    res.status(500).json({
      ok: false,
      delivered: 0,
      total: 0,
      error: tReq(req, "notification.errTestPush"),
      failures: [err.message || "unknown error"],
    });
  }
};

// ---------------- Admin ----------------

exports.adminSendOffer = async (req, res) => {
  try {
    const { title, message, promoCode, segment, userIds } = req.body || {};
    if (!title) return res.status(400).json({ error: tReq(req, "notification.offerTitleRequired") });
    const created = await svc.sendOfferToUsers({ title, message, promoCode, segment, userIds });
    res.json({ sent: created });
  } catch (err) {
    console.error("[notifications] adminSendOffer error:", err.message);
    res.status(500).json({ error: tReq(req, "notification.errSendOffer") });
  }
};

exports.adminSendCoupon = async (req, res) => {
  try {
    const { couponCode, discountText, segment, userIds } = req.body || {};
    if (!couponCode) return res.status(400).json({ error: tReq(req, "notification.couponCodeRequired") });
    const created = await svc.sendCouponToUsers({ couponCode, discountText, segment, userIds });
    res.json({ sent: created });
  } catch (err) {
    console.error("[notifications] adminSendCoupon error:", err.message);
    res.status(500).json({ error: tReq(req, "notification.errSendCoupon") });
  }
};

exports.adminBusStatus = async (req, res) => {
  try {
    const { busId, busName, kind, delayMinutes, date, newTime, route } = req.body || {};
    if (!busId) return res.status(400).json({ error: tReq(req, "notification.busIdRequired") });
    if (!["delayed", "rescheduled", "cancelled"].includes(kind)) {
      return res.status(400).json({ error: tReq(req, "notification.kindInvalid") });
    }
    const created = await svc.notifyBusStatusChange({
      busId,
      busName,
      kind,
      delayMinutes: Number(delayMinutes) || 0,
      date,
      newTime,
      route,
    });
    res.json({ notified: created });
  } catch (err) {
    console.error("[notifications] adminBusStatus error:", err.message);
    res.status(500).json({ error: tReq(req, "notification.errBusAlert") });
  }
};

exports.adminStats = async (req, res) => {
  try {
    const [total, unread, byCategory, failedChannels, userCount] = await Promise.all([
      Notification.countDocuments(),
      Notification.countDocuments({ read: false }),
      Notification.aggregate([{ $group: { _id: "$category", count: { $sum: 1 } } }]),
      Notification.countDocuments({
        $or: [
          { "channels.email.status": "failed" },
          { "channels.push.status": "failed" },
        ],
      }),
      require("../models/customer").countDocuments(),
    ]);
    res.json({ total, unread, byCategory, failedChannels, userCount });
  } catch (err) {
    console.error("[notifications] adminStats error:", err.message);
    res.status(500).json({ error: tReq(req, "notification.errStats") });
  }
};

exports.adminList = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const { search = "", category = "", type = "" } = req.query;
    const filter = {};
    if (category) filter.category = category;
    if (type) filter.type = type;
    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { title: { $regex: escaped, $options: "i" } },
        { message: { $regex: escaped, $options: "i" } },
      ];
    }
    const [total, items] = await Promise.all([
      Notification.countDocuments(filter),
      Notification.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
    ]);
    res.json({ items, total, page, limit, hasMore: page * limit < total });
  } catch (err) {
    console.error("[notifications] adminList error:", err.message);
    res.status(500).json({ error: tReq(req, "notification.errHistory") });
  }
};
