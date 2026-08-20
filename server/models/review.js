const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const reviewSchema = new Schema(
  {
    busId: {
      type: Schema.Types.ObjectId,
      ref: "Buses",
      required: true,
      index: true,
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: "Customers",
      required: true,
    },
    bookingId: {
      type: Schema.Types.ObjectId,
      ref: "Booking",
    },
    customerName: {
      type: String,
      default: "",
    },
    title: {
      type: String,
      default: "",
      maxlength: 120,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    comment: {
      type: String,
      default: "",
      maxlength: 2000,
    },
    photos: {
      type: [String],
      default: [],
      validate: {
        validator: function (v) {
          return v.length <= 5;
        },
        message: "A review can have at most 5 photos.",
      },
    },
    visible: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

reviewSchema.index({ busId: 1, customerId: 1 }, { unique: true });

module.exports = mongoose.model("Reviews", reviewSchema);
