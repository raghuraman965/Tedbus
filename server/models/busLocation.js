const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const busLocationSchema = new Schema({
  busId: {
    type: String,
    required: true,
  },
  date: {
    type: String,
    required: true,
  },
  latitude: {
    type: Number,
    default: 0,
  },
  longitude: {
    type: Number,
    default: 0,
  },
  speed: {
    type: Number,
    default: 0,
  },
  heading: {
    type: Number,
    default: 0,
  },
  currentStopSequence: {
    type: Number,
    default: 0,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

busLocationSchema.index({ busId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model("BusLocation", busLocationSchema);
