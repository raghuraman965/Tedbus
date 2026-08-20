const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const channelStateSchema = new Schema(
  {
    status: {
      type: String,
      enum: ["pending", "sent", "failed", "disabled"],
      default: "sent",
    },
    error: { type: String, default: null },
    retriedAt: { type: Date, default: null },
    attemptCount: { type: Number, default: 0 },
    deliveredAt: { type: Date, default: null },
  },
  { _id: false }
);

const CATEGORIES = [
  "booking", "payment", "journey", "trip_update", "bus",
  "cancellation", "refund", "offers", "promotions", "community",
  "support", "account", "security", "system",
];

const TYPES = [
  // Booking
  "booking_confirmed",
  "booking_cancelled",
  // Payment
  "payment_successful",
  "payment_failed",
  "payment_pending",
  // Journey / Trip
  "journey_reminder",
  "trip_reminder_24h",
  "trip_reminder_6h",
  "trip_reminder_2h",
  "trip_reminder_1h",
  "trip_reminder_30m",
  "boarding_reminder",
  "journey_completed",
  // Bus updates
  "bus_delayed",
  "bus_rescheduled",
  "bus_cancelled",
  "boarding_point_changed",
  "timing_changed",
  "route_changed",
  // Cancellation
  "ticket_cancelled",
  // Refund
  "refund_initiated",
  "refund_processing",
  "refund_successful",
  "refund_failed",
  // Offers / Promotions
  "offer",
  "coupon",
  "coupon_expiring",
  "personalized_offer",
  "festival_offer",
  // Community
  "community_activity",
  "community_like",
  "community_comment",
  "community_reply",
  "community_mention",
  "community_post_approved",
  "community_post_moderation",
  // Reviews
  "review_reply",
  // Support
  "support_ticket_created",
  "support_agent_reply",
  "support_ticket_resolved",
  // Account
  "account",
  "welcome",
  "profile_incomplete",
  // Security
  "new_login",
  "password_changed",
  "email_changed",
  "phone_changed",
  // System
  "maintenance",
  "service_disruption",
  "announcement",
];

const notificationSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    category: {
      type: String,
      enum: CATEGORIES,
      required: true,
    },
    type: {
      type: String,
      enum: TYPES,
      required: true,
    },
    title: { type: String, required: true },
    message: { type: String, default: "" },
    locale: { type: String, default: "en" },
    priority: {
      type: String,
      enum: ["low", "normal", "high", "critical"],
      default: "normal",
    },
    read: { type: Boolean, default: false },
    readAt: { type: Date, default: null },
    link: { type: String, default: null },
    payload: { type: Schema.Types.Mixed, default: {} },
    dedupKey: { type: String, default: null },
    expiresAt: { type: Date, default: null },
    channels: {
      inapp: { type: channelStateSchema, default: () => ({}) },
      email: { type: channelStateSchema, default: () => ({}) },
      push: { type: channelStateSchema, default: () => ({}) },
    },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, read: 1 });
notificationSchema.index({ userId: 1, dedupKey: 1 });
notificationSchema.index({ userId: 1, category: 1, createdAt: -1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, sparse: true });

module.exports = mongoose.model("Notifications", notificationSchema);
module.exports.CATEGORIES = CATEGORIES;
module.exports.TYPES = TYPES;
