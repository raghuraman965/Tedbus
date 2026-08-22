const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const bookingSchema = new Schema({
  customerId: {
    type: String,
    required: true,
  },
  passengerDetails: [
    {
      name: { type: String, required: true },
      gender: { type: String, required: true },
      age: { type: Number, required: true },
    },
  ],
  email: {
    type: String,
    required: true,
  },
  phoneNumber: {
    type: String,
    required: true,
  },
  fare: {
    type: Number,
    required: true,
  },
  status: {
    type: String,
    required: true,
  },
  bookingDate: {
    type: String,
    required: true,
  },
  busId: {
    type: String,
    required: true,
  },
  seats: {
    type: [Number],
    required: true,
  },
  departureDetails: {
    city: { type: String, required: true },
    time: { type: Number, required: true },
    date: { type: String, required: true },
  },
  arrivalDetails: {
    city: { type: String, required: true },
    time: { type: String, required: true },
    date: { type: String, required: true },
  },
  duration: {
    type: String,
    required: true,
  },
  isBusinessTravel: {
    type: Boolean,
    required: false,
  },
  businessDetails: {
    gst: { type: String, required: false },
    name: { type: String, required: false },
    address: { type: String, required: false },
    email: { type: String, required: false },
  },
  isInsurance: {
    type: Boolean,
    required: false,
  },
  isCovidDonated: {
    type: Boolean,
    required: false,
  },
  // Unique booking reference shown on tickets and used for the QR (e.g.
  // TED26080583917). Sparse so pre-existing bookings without a PNR stay valid.
  pnr: {
    type: String,
    required: false,
    unique: true,
    sparse: true,
    trim: true,
  },
  // One of: pending_payment | payment_verified | ticket_confirmed | cancelled |
  // completed. Pre-upgrade bookings used "upcoming" — treated as
  // ticket_confirmed by the UI and the journey-reminder scheduler.
  // paymentStatus: verified | failed | refunded | pending (undefined on legacy
  // bookings, which the UI renders as "verified").
  paymentStatus: {
    type: String,
    required: false,
    enum: ["pending", "verified", "failed", "refunded"],
  },
  // Idempotency key that links this booking to its verified payment attempt.
  paymentReference: {
    type: String,
    required: false,
    default: "",
  },
  transactionId: {
    type: String,
    required: false,
    default: "",
  },
  paymentMethod: {
    type: String,
    required: false,
    default: "",
  },
  paymentTime: {
    type: Date,
    required: false,
  },
  // Denormalized bus snapshot so trips/tickets render operator, type and image
  // without a second query. Legacy bookings fall back gracefully in the UI.
  busDetails: {
    operatorName: { type: String, default: "" },
    busType: { type: String, default: "" },
    image: { type: String, default: "" },
    departureTime: { type: String, default: "" },
  },
  // Booking lifecycle events in order: booked, payment_verified,
  // ticket_confirmed, boarded, journey_completed, cancelled.
  timeline: [
    {
      status: { type: String, default: "" },
      at: { type: Date, default: Date.now },
    },
  ],
  // Signed QR payload (base64url JSON + HMAC). Regenerated on demand for the
  // PDF, but stored here so the ticket page and driver-verification endpoint
  // always validate against exactly what was issued.
  qrPayload: {
    type: String,
    required: false,
    default: "",
  },
  // NEW: segment-based booking fields
  boardingStopSequence: { type: Number, default: null },
  droppingStopSequence: { type: Number, default: null },
  boardingStopName: { type: String, default: "" },
  droppingStopName: { type: String, default: "" },
  segmentDistanceKm: { type: Number, default: 0 },
  journeyDate: { type: String, default: "" },
  journeyId: { type: String, default: "" },
  // Seat-hold that was converted into this booking (payment-flow linkage).
  holdId: { type: String, default: "" },
  fareSnapshot: {
    baseFare: { type: Number, default: 0 },
    seatFare: { type: Number, default: 0 },
    dynamicFare: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    serviceFee: { type: Number, default: 0 },
    totalFare: { type: Number, default: 0 },
    pricePerKm: { type: Number, default: 0 },
    distance: { type: Number, default: 0 },
  },
  // --- Cancellation / refund (all amounts computed server-side against the
  // admin-configured cancellation policy — never trusted from the client).
  cancelledAt: { type: Date, default: null },
  cancelledBy: { type: String, default: "" },
  refundAmount: { type: Number, default: 0 },
  refundPercent: { type: Number, default: null },
  refundStatus: {
    type: String,
    enum: ["none", "initiated", "processed", "failed", "not_applicable"],
    default: "none",
  },
  cancellationReason: { type: String, default: "" },
});

module.exports = mongoose.model("Bookings", bookingSchema);