const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const communityPostSchema = new Schema({
  userId: {
    type: String,
    required: true,
  },
  title: {
    type: String,
    required: true,
  },
  story: {
    type: String,
    required: true,
  },
  route: {
    type: String,
    required: true,
  },
  destination: {
    type: String,
    required: true,
  },
  travelDate: {
    type: String,
    required: true,
  },
  images: {
    type: [String],
    default: [],
  },
  tips: {
    type: [String],
    default: [],
  },
  tags: {
    type: [String],
    default: [],
  },
  category: {
    type: String,
    required: true,
    enum: ["Routes", "Destinations", "Travel Advice", "Journey Experiences"],
  },
  likedBy: {
    type: [String],
    default: [],
  },
  bookmarkedBy: {
    type: [String],
    default: [],
  },
  shares: {
    type: Number,
    default: 0,
  },
  likesCount: {
    type: Number,
    default: 0,
  },
  commentsCount: {
    type: Number,
    default: 0,
  },
  reportCount: {
    type: Number,
    default: 0,
  },
  moderationStatus: {
    type: String,
    enum: ["active", "hidden", "removed"],
    default: "active",
  },
  moderationNote: {
    type: String,
    default: "",
  },
  moderatedBy: {
    type: String,
    default: null,
  },
  moderatedAt: {
    type: Date,
    default: null,
  },
  views: {
    type: Number,
    default: 0,
  },
  removedByAdmin: {
    type: Boolean,
    default: false,
  },
  editedAt: {
    type: Date,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

communityPostSchema.index({ category: 1 });
communityPostSchema.index({ tags: 1 });
communityPostSchema.index({ likesCount: -1, views: -1 });
communityPostSchema.index({ reportCount: -1 });

module.exports = mongoose.model("CommunityPosts", communityPostSchema);
