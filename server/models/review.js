const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// ---------------------------------------------------------------------------
// Reviews (Task 6 — rating & review system)
//
// A review is always tied to ONE completed journey (booking) of ONE user on
// ONE route. The unique index on bookingId enforces "one review per completed
// journey" while still allowing the same user to review the same route again
// after a different journey. Moderated (hidden/removed) reviews stay in the
// database for auditability but are excluded from every public aggregation.
// ---------------------------------------------------------------------------

const REVIEW_STATUSES = ["visible", "hidden", "removed"];
const REPORT_REASONS = ["spam", "abuse", "fake", "harassment", "other"];

const reviewReportSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: "Customers", required: true },
    reason: { type: String, enum: REPORT_REASONS, default: "other" },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const reviewSchema = new Schema(
  {
    // Route is the primary review target (Task 6: "rate and review bus routes").
    routeId: {
      type: Schema.Types.ObjectId,
      ref: "Routes",
      required: true,
      index: true,
    },
    // Bus is denormalized for bus-scoped listings / admin filters.
    busId: {
      type: Schema.Types.ObjectId,
      ref: "Buses",
      required: true,
      index: true,
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: "Customers",
      required: true,
      index: true,
    },
    // The completed journey this review belongs to. Unique → one review per
    // journey; concurrent duplicates fail on E11000 instead of double-posting.
    bookingId: {
      type: Schema.Types.ObjectId,
      ref: "Bookings",
      required: true,
    },
    // Date of the reviewed journey ("YYYY-MM-DD") for display/audit.
    journeyDate: { type: String, default: "" },

    customerName: { type: String, default: "" },
    customerPhoto: { type: String, default: "" },
    title: { type: String, default: "", maxlength: 120 },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, default: "", maxlength: 2000 },

    photos: {
      type: [String],
      default: [],
      validate: {
        validator: function (v) {
          return v.length <= 5;
        },
        message: "A review can have at most 5 photos.",
      },
    },

    // Moderation. status drives all public aggregations; `visible` is kept in
    // sync for backward compatibility with existing admin tooling.
    status: { type: String, enum: REVIEW_STATUSES, default: "visible", index: true },
    visible: { type: Boolean, default: true },
    moderatedAt: { type: Date, default: null },
    moderationReason: { type: String, default: "" },

    // User reports. Auto-hide happens at REPORT_AUTO_HIDE_THRESHOLD reports.
    reports: { type: [reviewReportSchema], default: [] },

    // Helpful/upvotes. One vote per user; toggling removes it.
    helpfulVotes: { type: [Schema.Types.ObjectId], default: [] },

    // Edit tracking (24h edit window is enforced in the controller).
    isEdited: { type: Boolean, default: false },
    editedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// One review per completed journey/booking (sparse so legacy rows survive).
reviewSchema.index({ bookingId: 1 }, { unique: true, sparse: true });
// Aggregation/listing lookups.
reviewSchema.index({ routeId: 1, status: 1, createdAt: -1 });
reviewSchema.index({ busId: 1, status: 1 });

reviewSchema.virtual("helpfulCount").get(function () {
  return Array.isArray(this.helpfulVotes) ? this.helpfulVotes.length : 0;
});
reviewSchema.virtual("reportCount").get(function () {
  return Array.isArray(this.reports) ? this.reports.length : 0;
});

reviewSchema.set("toJSON", { virtuals: true });
reviewSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Reviews", reviewSchema);
module.exports.REVIEW_STATUSES = REVIEW_STATUSES;
module.exports.REPORT_REASONS = REPORT_REASONS;
