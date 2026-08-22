const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// ---------------------------------------------------------------------------
// Configurable cancellation / refund policy (admin-editable singleton).
//
// refundSlabs are evaluated from the most restrictive to the least: the first
// slab whose `minHoursBeforeDeparture` <= actual hours-before-departure wins.
// Example default:
//   >= 24h before departure -> 90% refund
//   >= 12h before departure -> 70% refund
//   >=  6h before departure -> 50% refund
//   <   6h before departure ->  0% refund
//
// serviceFeeRefundable=false means the per-seat service fee is NEVER refunded
// regardless of slab. GST is refunded proportionally with the taxable part.
// ---------------------------------------------------------------------------
const refundSlabSchema = new Schema(
  {
    // Minimum hours before the boarding-stop departure this slab applies to.
    minHoursBeforeDeparture: { type: Number, required: true, min: 0 },
    refundPercent: { type: Number, required: true, min: 0, max: 100 },
    label: { type: String, default: "" },
  },
  { _id: false }
);

const cancellationPolicySchema = new Schema(
  {
    key: { type: String, required: true, unique: true, default: "global", trim: true },
    refundSlabs: {
      type: [refundSlabSchema],
      default: () => [
        { minHoursBeforeDeparture: 24, refundPercent: 90, label: "More than 24h" },
        { minHoursBeforeDeparture: 12, refundPercent: 70, label: "12-24h" },
        { minHoursBeforeDeparture: 6, refundPercent: 50, label: "6-12h" },
        { minHoursBeforeDeparture: 0, refundPercent: 0, label: "Under 6h" },
      ],
    },
    serviceFeeRefundable: { type: Boolean, default: false },
    taxRefundable: { type: Boolean, default: true },
    allowCancellationAfterDeparture: { type: Boolean, default: false },
  },
  { timestamps: true }
);

cancellationPolicySchema.statics.getGlobal = async function getGlobal() {
  let doc = await this.findOne({ key: "global" }).lean().exec();
  if (!doc) {
    doc = await this.create({ key: "global" });
    doc = doc.toObject();
  }
  return doc;
};

module.exports = mongoose.model("CancellationPolicy", cancellationPolicySchema);
