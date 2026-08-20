const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const adminSchema = new Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    password: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      default: "",
    },
    role: {
      type: String,
      enum: ["superadmin", "moderator"],
      default: "superadmin",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

adminSchema.methods.toSafeJSON = function () {
  return {
    _id: this._id,
    username: this.username,
    name: this.name,
    role: this.role,
    isActive: this.isActive,
    createdAt: this.createdAt,
    lastLoginAt: this.lastLoginAt,
  };
};

module.exports = mongoose.model("Admins", adminSchema);
