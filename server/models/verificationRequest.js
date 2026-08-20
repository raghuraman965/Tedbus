const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const verificationRequestSchema = new Schema({
  customerId: {
    type: Schema.Types.ObjectId,
    ref: "Customers",
    required: true,
  },
  status: {
    type: String,
    enum: ["pending", "approved", "rejected"],
    default: "pending",
  },
  fullName: { type: String, required: true },
  phone: { type: String, required: true },
  dateOfBirth: { type: String, required: true },
  gender: { type: String, default: "" },
  address: { type: String, default: "" },
  idProofType: { type: String, default: "aadhaar" },
  idProofNumber: { type: String, default: "" },
  reason: { type: String, default: "" },
  adminNote: { type: String, default: "" },
  reviewedBy: { type: Schema.Types.ObjectId, ref: "Customers", default: null },
  submittedAt: { type: Date, default: Date.now },
  reviewedAt: { type: Date, default: null },
});

module.exports = mongoose.model("VerificationRequest", verificationRequestSchema);
