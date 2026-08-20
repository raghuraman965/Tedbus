const mongoose = require("mongoose");

const driverSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, unique: true, trim: true },
    email: { type: String, default: "", trim: true },
    licenseNumber: { type: String, required: true, trim: true },
    licenseExpiry: { type: Date, default: null },
    assignedBus: { type: String, default: "" },
    assignedRoute: { type: String, default: "" },
    isVerified: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    experience: { type: Number, default: 0 },
    rating: { type: Number, default: 0 },
    avatar: { type: String, default: "" },
  },
  { timestamps: true }
);

driverSchema.index({ name: "text", phone: "text", licenseNumber: "text" });

module.exports = mongoose.model("Driver", driverSchema);
