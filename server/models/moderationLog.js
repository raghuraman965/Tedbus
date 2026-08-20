const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const moderationLogSchema = new Schema(
  {
    adminId: {
      type: String,
      required: true,
    },
    action: {
      type: String,
      enum: [
        "post_hide",
        "post_restore",
        "post_remove",
        "comment_hide",
        "comment_restore",
        "comment_remove",
        "report_dismiss",
        "report_actioned",
        "user_warn",
        "user_suspend",
      ],
      required: true,
    },
    targetType: {
      type: String,
      enum: ["post", "comment", "report", "user"],
      required: true,
    },
    targetId: {
      type: String,
      required: true,
    },
    reason: {
      type: String,
      default: "",
    },
    previousStatus: {
      type: String,
      default: null,
    },
    newStatus: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

moderationLogSchema.index({ targetType: 1, targetId: 1 });
moderationLogSchema.index({ adminId: 1 });
moderationLogSchema.index({ action: 1 });
moderationLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model("ModerationLog", moderationLogSchema);
