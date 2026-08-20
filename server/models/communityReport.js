const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const communityReportSchema = new Schema(
  {
    reporterUserId: {
      type: String,
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
    targetUserId: {
      type: String,
      default: null,
    },
    reason: {
      type: String,
      enum: ["Spam", "Abuse", "Fake Information", "Harassment", "Other"],
      required: true,
    },
    details: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      enum: ["pending", "actioned", "dismissed"],
      default: "pending",
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// A user can report a given post/comment only once.
communityReportSchema.index({ reporterUserId: 1, postId: 1 }, { unique: true, sparse: true });
communityReportSchema.index({ reporterUserId: 1, commentId: 1 }, { unique: true, sparse: true });
communityReportSchema.index({ status: 1 });
communityReportSchema.index({ targetUserId: 1 });

module.exports = mongoose.model("CommunityReports", communityReportSchema);
