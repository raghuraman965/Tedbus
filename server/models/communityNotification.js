const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const communityNotificationSchema = new Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    actorUserId: {
      type: String,
      default: null,
    },
    type: {
      type: String,
      enum: [
        "like",
        "comment",
        "reply",
        "follow",
        "mention",
        "post_approved",
        "verification_approved",
        "system",
      ],
      required: true,
    },
    postId: {
      type: String,
      default: null,
    },
    commentId: {
      type: String,
      default: null,
    },
    message: {
      type: String,
      default: "",
    },
    read: {
      type: Boolean,
      default: false,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

communityNotificationSchema.index({ userId: 1, read: 1 });
communityNotificationSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model("CommunityNotifications", communityNotificationSchema);
