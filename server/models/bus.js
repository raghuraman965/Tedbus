const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const busSchema = new Schema({
  operatorName: {
    type: String,
    required: true,
  },
  // Registration / reference number shown in admin and on tickets (e.g. TN01AB1234).
  busNumber: {
    type: String,
    required: false,
    default: "",
    trim: true,
  },
  busType: {
    type: String,
    required: true,
  },
  departureTime: {
    type: String,
    required: true,
  },
  arrivalTime: {
    type: String,
    required: false,
    default: "",
  },
  amenities: {
    type: [String],
    required: false,
    default: [],
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
  // Inactive buses never appear in customer search.
  isActive: {
    type: Boolean,
    default: true,
  },
  // NEW: operating schedule (0=Sun, 1=Mon, ... 6=Sat)
  operatingDays: {
    type: [Number],
    default: [0, 1, 2, 3, 4, 5, 6],
  },
  // NEW: fare overrides per bus (route fareConfig is primary, these override)
  fareOverrides: {
    busTypeMultiplier: { type: Number, default: null },
    // NOTE: Map fields must never default to null — mongoose Map validation
    // calls .keys() on the value and crashes.
    seatTypePrices: { type: Map, of: Number, default: () => ({}) },
  },
  // NEW: seat layout configuration
  seatLayout: {
    seatsPerRow: { type: Number, default: 4 },
    totalRows: { type: Number, default: 10 },
    seatTypes: {
      type: Map,
      of: [Number],
      default: () => ({}),
    },
  },
});

module.exports = mongoose.model("Buses", busSchema);
