const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const savedRouteSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: "Customers",
    required: true,
    index: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
    default: "",
  },
  source: {
    type: String,
    required: true,
    trim: true,
  },
  destination: {
    type: String,
    required: true,
    trim: true,
  },
  waypoints: [
    {
      name: { type: String, default: "" },
      lat: { type: Number, required: true },
      lon: { type: Number, required: true },
    },
  ],
  distanceKm: {
    type: Number,
    required: true,
    min: 0,
  },
  durationMin: {
    type: Number,
    required: true,
    min: 0,
  },
  // GeoJSON LineString coordinates: [[lon, lat], ...] as returned by OSRM.
  geometry: {
    type: [[Number]],
    default: [],
  },
  // How the duration was estimated ("estimated" = no live traffic available).
  trafficMode: {
    type: String,
    default: "estimated",
  },
  stops: {
    type: Number,
    default: 0,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("SavedRoute", savedRouteSchema);
