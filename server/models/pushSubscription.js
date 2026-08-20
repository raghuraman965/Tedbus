const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const pushSubscriptionSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    endpoint: { type: String, required: true },
    keys: {
      p256dh: { type: String, default: "" },
      auth: { type: String, default: "" },
    },
    userAgent: { type: String, default: "" },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

pushSubscriptionSchema.index({ userId: 1, endpoint: 1 }, { unique: true });

module.exports = mongoose.model("PushSubscriptions", pushSubscriptionSchema);
