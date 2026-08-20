const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const stopSchema = new Schema({
  stopName: { type: String, required: true },
  stopId: { type: String, required: true },
  sequence: { type: Number, required: true },
  departureTime: { type: String, required: true },
  arrivalTime: { type: String, required: true },
  distanceFromOrigin: { type: Number, required: true, default: 0 },
  latitude: { type: Number, default: 0 },
  longitude: { type: Number, default: 0 },
  boardingPoints: { type: [String], default: [] },
  droppingPoints: { type: [String], default: [] },
}, { _id: false });

const fareConfigSchema = new Schema({
  baseFare: { type: Number, default: 0 },
  pricePerKm: { type: Number, default: 0 },
  minimumFare: { type: Number, default: 50 },
  taxPercent: { type: Number, default: 5 },
  serviceFee: { type: Number, default: 10 },
  busTypeMultipliers: {
    type: Map,
    of: Number,
    default: {
      standard: 1.0,
      sleeper: 1.8,
      "A/C Seater": 1.5,
      "A/C Sleeper": 2.0,
      "Non-A/C": 0.9,
      volvo: 2.2,
    },
  },
  seatTypePremiums: {
    type: Map,
    of: Number,
    default: {
      regular: 0,
      window: 30,
      sleeper: 100,
      "lower-berth": 50,
      "upper-berth": 20,
    },
  },
  dynamicPricing: {
    enabled: { type: Boolean, default: false },
    thresholds: {
      lowOccupancy: { type: Number, default: 50 },
      midOccupancy: { type: Number, default: 75 },
      highOccupancy: { type: Number, default: 90 },
    },
    surcharges: {
      low: { type: Number, default: 0 },
      mid: { type: Number, default: 5 },
      high: { type: Number, default: 10 },
      peak: { type: Number, default: 15 },
    },
    weekendMultiplier: { type: Number, default: 1.05 },
    holidayMultiplier: { type: Number, default: 1.10 },
  },
}, { _id: false });

const routesSchema = new Schema({
  departureLocation: {
    name: { type: String, required: true },
    subLocations: { type: [String] },
  },
  arrivalLocation: {
    name: { type: String, required: true },
    subLocations: { type: [String] },
  },
  duration: { type: Number, required: true },
  stops: { type: [stopSchema], default: [] },
  totalDistanceKm: { type: Number, default: 0 },
  fareConfig: { type: fareConfigSchema, default: () => ({}) },
  routeName: { type: String, default: "" },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

routesSchema.index({ "stops.stopName": 1 });
routesSchema.index({ "stops.sequence": 1 });

module.exports = mongoose.model("Routes", routesSchema);
