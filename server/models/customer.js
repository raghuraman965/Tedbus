const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const customerSchema = new Schema({
  name: {
    type: String,
    required: true,
  },
  googleId: {
    type: String,
    required: false,
  },
  age: {
    type: Number,
    required: false,
  },
  gender: {
    type: String,
    required: false,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  dateOfBirth: {
    type: String,
    required: false,
  },
  profilePicture: {
    type: String,
    required: false,
  },
  phone: {
    type: String,
    required: false,
    // sparse so accounts without a phone (e.g. Google/OTP) do not collide
    unique: true,
    sparse: true,
  },
  password: {
    type: String,
    required: false,
  },
  authProvider: {
    type: String,
    required: false,
    default: "google",
  },
  isAdmin: {
    type: Boolean,
    required: false,
    default: false,
  },
  bio: {
    type: String,
    required: false,
    default: "",
  },
  location: {
    type: String,
    required: false,
    default: "",
  },
  coverImage: {
    type: String,
    required: false,
    default: "",
  },
  isVerified: {
    type: Boolean,
    required: false,
    default: false,
  },
  profileCompleted: {
    type: Boolean,
    required: false,
    default: false,
  },
  verificationBadge: {
    type: Boolean,
    required: false,
    default: false,
  },
  isSuspended: {
    type: Boolean,
    required: false,
    default: false,
  },
  preferredLanguage: {
    type: String,
    required: false,
    default: "en",
  },
  themePreference: {
    type: String,
    required: false,
    enum: ["light", "dark", "system"],
    default: "system",
  },
  alternatePhone: {
    type: String,
    required: false,
    sparse: true,
  },
  address: {
    street: { type: String, default: "" },
    city: { type: String, default: "" },
    state: { type: String, default: "" },
    pincode: { type: String, default: "" },
    country: { type: String, default: "" },
  },
  emergencyContact: {
    name: { type: String, default: "" },
    phone: { type: String, default: "" },
    relation: { type: String, default: "" },
  },
  travelPreferences: {
    seatType: { type: String, default: "" },
    busType: { type: String, default: "" },
    language: { type: String, default: "" },
    notifications: { type: Boolean, default: true },
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports=mongoose.model("Customers",customerSchema)