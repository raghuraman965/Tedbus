const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const segmentBookingSchema = new Schema({
  seatNumber: { type: Number, required: true },
  boardingSequence: { type: Number, required: true },
  droppingSequence: { type: Number, required: true },
  bookingId: { type: String, default: "" },
  lockedAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, default: null },
}, { _id: false });

const seatLockSchema = new Schema({
  busId: {
    type: String,
    required: true,
  },
  date: {
    type: String,
    required: true,
  },
  // Legacy flat seat list for backward compat
  bookedSeats: {
    type: [Number],
    default: [],
  },
  // NEW: segment-level bookings
  segmentBookings: {
    type: [segmentBookingSchema],
    default: [],
  },
});

seatLockSchema.index({ busId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model("SeatLocks", seatLockSchema);
