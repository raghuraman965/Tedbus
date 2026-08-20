const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const busSchema = new Schema({
  operatorName: {
    type: String,
    required: true,
  },
  busType: {
    type: String,
    required: true,
  },
  departureTime: {
    type: String,
    required: true,
  },
  rating: {
    type: [Number],
    required: true,
  },
  totalSeats: {
    type: Number,
    required: false,
    default: 40,
  },
  routes: {
    type: Schema.Types.ObjectId,
    ref: "Routes",
    required: true,
  },
  images: {
    type: String,
    required: true,
  },
  liveTracking: {
    type: Number,
    required: true,
  },
  reschedulable: {
    type: Number,
    required: true,
  },
  // NEW: operating schedule (0=Sun, 1=Mon, ... 6=Sat)
  operatingDays: {
    type: [Number],
    default: [0, 1, 2, 3, 4, 5, 6],
  },
  // NEW: fare overrides per bus (route fareConfig is primary, these override)
  fareOverrides: {
    busTypeMultiplier: { type: Number, default: null },
    seatTypePrices: { type: Map, of: Number, default: null },
  },
  // NEW: seat layout configuration
  seatLayout: {
    seatsPerRow: { type: Number, default: 4 },
    totalRows: { type: Number, default: 10 },
    seatTypes: {
      type: Map,
      of: [Number],
      default: null,
    },
  },
});

module.exports = mongoose.model("Buses", busSchema);
