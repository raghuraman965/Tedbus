const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const paymentSettingsSchema = new Schema(
  {
    merchantName: {
      type: String,
      required: false,
      default: "TedBus",
    },
    upiId: {
      type: String,
      required: false,
      default: "",
    },
    qrImage: {
      type: String,
      required: false,
      default: "",
    },
    accountName: {
      type: String,
      required: false,
      default: "",
    },
    isActive: {
      type: Boolean,
      required: false,
      default: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PaymentSettings", paymentSettingsSchema);
