const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const communityFollowSchema = new Schema(
  {
    followerId: {
      type: String,
      required: true,
    },
    followingId: {
      type: String,
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

communityFollowSchema.index({ followerId: 1, followingId: 1 }, { unique: true });
communityFollowSchema.index({ followingId: 1 });

module.exports = mongoose.model("CommunityFollows", communityFollowSchema);
