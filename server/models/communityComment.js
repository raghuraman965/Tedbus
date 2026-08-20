const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const communityCommentSchema = new Schema({
  postId: {
    type: String,
    required: true,
  },
  userId: {
    type: String,
    required: true,
  },
  parentCommentId: {
    type: String,
    default: null,
  },
  content: {
    type: String,
    required: true,
    maxlength: 2000,
  },
  likedBy: {
    type: [String],
    default: [],
  },
  edited: {
    type: Boolean,
    default: false,
  },
  deleted: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

communityCommentSchema.index({ postId: 1 });
communityCommentSchema.index({ parentCommentId: 1 });

module.exports = mongoose.model("CommunityComments", communityCommentSchema);
