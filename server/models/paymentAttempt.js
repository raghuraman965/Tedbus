const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// Tracks a single payment attempt so the same payment cannot be reused for two
// bookings (duplicate payment) and so a stale, never-used payment cannot be
// applied to a booking long after it was "paid" (expired payment).
//
// Flow:
//   1. Client calls POST /booking/verify-payment with a fresh paymentReference.
//      Backend (simulated gateway) marks the attempt `verified` with a 10-min
//      expiry window.
//   2. Client then calls POST /booking. Backend requires the attempt to exist,
//      be `verified`, not expired, and not already consumed. If all good it is
//      marked `used` (linked to the booking) — making a second booking with the
//      same reference impossible.
const paymentAttemptSchema = new Schema({
  paymentReference: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  customerId: {
    type: String,
    required: true,
  },
  amount: {
    type: Number,
    required: true,
    min: 0,
  },
  method: {
    type: String,
    default: "upi",
  },
  status: {
    type: String,
    enum: ["pending", "verified", "failed", "expired", "used"],
    default: "pending",
  },
  transactionId: {
    type: String,
    default: "",
  },
  // Seat-hold this payment belongs to. The booking can only consume a
  // payment whose hold is still active — abandoned checkouts simply expire.
  holdId: {
    type: String,
    default: "",
  },
  // Booking context snapshot (route/bus/date/seats/segment) captured at
  // order time so verification never depends on client-supplied context.
  context: {
    routeId: { type: String, default: "" },
    busId: { type: String, default: "" },
    date: { type: String, default: "" },
    seats: { type: [Number], default: [] },
    boardingStopSequence: { type: Number, default: null },
    droppingStopSequence: { type: Number, default: null },
  },
  // Razorpay identifiers (present for gateway payments)
  razorpayOrderId: {
    type: String,
    default: "",
  },
  razorpayPaymentId: {
    type: String,
    default: "",
  },
  expiresAt: {
    type: Date,
    required: true,
  },
  bookingId: {
    type: String,
    default: "",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("PaymentAttempts", paymentAttemptSchema);
