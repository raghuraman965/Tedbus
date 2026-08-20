const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const CATEGORIES = [
  "booking", "payment", "journey", "trip_update", "bus",
  "cancellation", "refund", "offers", "promotions", "community",
  "support", "account", "security", "system",
];
const CHANNELS = ["inapp", "email", "push"];
const LOCALES = ["en", "hi", "ta", "te", "kn", "ml"];

const REMINDER_TIERS = ["24h", "6h", "2h", "1h", "30m"];

// Per-category-per-channel preference: each category has an object with
// channel booleans plus an `enabled` master toggle for the category.
function buildDefaultCategoryPrefs() {
  const prefs = {};
  for (const cat of CATEGORIES) {
    prefs[cat] = {
      enabled: true,
      inapp: true,
      email: true,
      push: cat === "offers" || cat === "promotions" ? false : true,
    };
  }
  return prefs;
}

const preferenceSchema = new Schema(
  {
    userId: { type: String, required: true, unique: true, index: true },
    locale: { type: String, enum: LOCALES, default: "en" },
    channels: {
      inapp: { type: Boolean, default: true },
      email: { type: Boolean, default: true },
      push: { type: Boolean, default: true },
    },
    categories: {
      type: Schema.Types.Mixed,
      default: buildDefaultCategoryPrefs,
    },
    // Legacy simple booleans for backward compatibility (old clients)
    legacyCategories: {
      booking: { type: Boolean, default: true },
      journey: { type: Boolean, default: true },
      bus: { type: Boolean, default: true },
      offers: { type: Boolean, default: true },
      community: { type: Boolean, default: true },
      reviews: { type: Boolean, default: true },
      account: { type: Boolean, default: true },
    },
    promotionalOptIn: { type: Boolean, default: false },
    reminderTiers: {
      type: [String],
      enum: REMINDER_TIERS,
      default: ["24h", "2h", "30m"],
    },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Virtual to check if a category+channel combo is enabled
preferenceSchema.methods.isChannelEnabled = function (category, channel) {
  const catPref = this.categories && this.categories[category];
  if (!catPref || catPref.enabled === false) return false;
  if (catPref[channel] === false) return false;
  if (this.channels && this.channels[channel] === false) return false;
  return true;
};

module.exports = mongoose.model("NotificationPreferences", preferenceSchema);
module.exports.CATEGORIES = CATEGORIES;
module.exports.CHANNELS = CHANNELS;
module.exports.LOCALES = LOCALES;
module.exports.REMINDER_TIERS = REMINDER_TIERS;
