const fs = require("fs");
const path = require("path");
const multer = require("multer");
const CommunityPost = require("../models/communityPost");
const CommunityComment = require("../models/communityComment");
const CommunityReport = require("../models/communityReport");
const CommunityFollow = require("../models/communityFollow");
const CommunityNotification = require("../models/communityNotification");
const Customer = require("../models/customer");
const notificationService = require("../services/notificationService");
const { t, resolveLang } = require("../services/i18n");

const AUTO_HIDE_REPORT_THRESHOLD = 5;

// ===================== IMAGE UPLOAD =====================

const communityUploadsDir = path.join(__dirname, "..", "uploads", "community");
if (!fs.existsSync(communityUploadsDir)) {
  fs.mkdirSync(communityUploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, communityUploadsDir),
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || ".png").toLowerCase();
    cb(null, `community-${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(png|jpe?g|gif|webp)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error("Only image files (PNG/JPG/GIF/WEBP) are allowed."));
  },
});

function removeUploadedImages(images) {
  if (!Array.isArray(images)) return;
  images.forEach((img) => {
    if (typeof img === "string" && img.startsWith("/uploads/community/")) {
      const filePath = path.join(__dirname, "..", img.replace(/^\//, ""));
      if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch (err) { /* best effort */ }
      }
    }
  });
}

// ===================== HELPERS =====================

function extractHashtags(text) {
  if (!text) return [];
  const matches = String(text).match(/#([a-zA-Z0-9_]+)/g) || [];
  return [...new Set(matches.map((m) => m.replace("#", "").toLowerCase()))];
}

function extractMentions(text) {
  if (!text) return [];
  const matches = String(text).match(/@([a-zA-Z0-9_.-]+)/g) || [];
  return [...new Set(matches.map((m) => m.slice(1)))];
}

function computeBadge(postsCount, totalLikes, lang) {
  // Real, derived from actual activity — not assigned arbitrarily.
  if (postsCount >= 10 && totalLikes >= 50) return t(lang, "community.badgeTrusted");
  if (postsCount >= 5) return t(lang, "community.badgeActive");
  if (postsCount >= 1) return t(lang, "community.badgeStoryteller");
  return null;
}

function toPublicUser(customerDoc, stats, followInfo, lang) {
  if (!customerDoc) {
    return { id: "deleted", name: t(lang, "community.deletedUser"), avatar: "", verified: false, badge: null };
  }
  const initials = (customerDoc.name || "?")
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const postsCount = stats?.postsCount || 0;
  const totalLikes = stats?.totalLikes || 0;
  return {
    id: customerDoc._id.toString(),
    name: customerDoc.name,
    avatar:
      customerDoc.profilePicture ||
      `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(initials)}&backgroundColor=D84E55`,
    verified: customerDoc.isVerified === true || customerDoc.authProvider === "google",
    badge: computeBadge(postsCount, totalLikes, lang),
    bio: customerDoc.bio || "",
    location: customerDoc.location || "",
    coverImage: customerDoc.coverImage || "",
    joinedAt: customerDoc.createdAt || null,
    postsCount: postsCount || undefined,
    totalLikes: totalLikes || undefined,
    followers: followInfo?.followers ?? undefined,
    following: followInfo?.following ?? undefined,
    isFollowing: followInfo?.isFollowing ?? undefined,
    isSuspended: customerDoc.isSuspended === true,
  };
}

async function getUserMap(userIds, lang) {
  const uniqueIds = [...new Set(userIds)].filter(Boolean);
  if (!uniqueIds.length) return {};
  const customers = await Customer.find({ _id: { $in: uniqueIds } }).lean().exec();

  const statsAgg = await CommunityPost.aggregate([
    { $match: { userId: { $in: uniqueIds }, removedByAdmin: { $ne: true } } },
    { $group: { _id: "$userId", postsCount: { $sum: 1 }, totalLikes: { $sum: { $size: "$likedBy" } } } },
  ]);
  const statsMap = {};
  statsAgg.forEach((s) => { statsMap[s._id] = s; });

  const map = {};
  customers.forEach((c) => {
    map[c._id.toString()] = toPublicUser(c, statsMap[c._id.toString()], undefined, lang);
  });
  return map;
}

async function getFollowCounts(userId) {
  const [followers, following] = await Promise.all([
    CommunityFollow.countDocuments({ followingId: userId }),
    CommunityFollow.countDocuments({ followerId: userId }),
  ]);
  return { followers, following };
}

async function getFollowingIds(userId) {
  if (!userId) return [];
  const docs = await CommunityFollow.find({ followerId: userId }).lean().exec();
  return docs.map((d) => d.followingId);
}

function buildCommentTree(flatComments, userMap, lang, currentUserId) {
  const byId = {};
  flatComments.forEach((c) => {
    byId[c._id.toString()] = {
      id: c._id.toString(),
      user: userMap[c.userId] || toPublicUser(null, undefined, undefined, lang),
      content: c.deleted ? t(lang, "community.deletedComment") : c.content,
      likes: c.likedBy.length,
      liked: currentUserId ? c.likedBy.includes(currentUserId) : false,
      timePosted: c.createdAt,
      edited: c.edited,
      replies: [],
      parentCommentId: c.parentCommentId,
    };
  });

  const roots = [];
  flatComments.forEach((c) => {
    const node = byId[c._id.toString()];
    if (c.parentCommentId && byId[c.parentCommentId]) {
      byId[c.parentCommentId].replies.push(node);
    } else {
      roots.push(node);
    }
  });
  return roots;
}

function countComments(nestedComments) {
  let count = 0;
  for (const c of nestedComments) {
    count += 1;
    count += countComments(c.replies);
  }
  return count;
}

async function enrichPosts(posts, currentUserId, lang) {
  const userIds = posts.map((p) => p.userId);
  const userMap = await getUserMap(userIds, lang);

  const postIds = posts.map((p) => p._id.toString());
  const allComments = await CommunityComment.find({ postId: { $in: postIds } }).lean().exec();
  const commentUserIds = allComments.map((c) => c.userId);
  const commentUserMap = await getUserMap(commentUserIds, lang);

  const followingIds = currentUserId ? await getFollowingIds(currentUserId) : [];

  return posts.map((p) => {
    const postComments = allComments.filter((c) => c.postId === p._id.toString());
    const commentTree = buildCommentTree(postComments, commentUserMap, lang, currentUserId);

    return {
      id: p._id.toString(),
      user: {
        ...(userMap[p.userId] || toPublicUser(null, undefined, undefined, lang)),
        isFollowing: currentUserId ? followingIds.includes(p.userId) : undefined,
      },
      title: p.title,
      story: p.story,
      route: p.route,
      destination: p.destination,
      travelDate: p.travelDate,
      images: p.images,
      tips: p.tips,
      tags: p.tags,
      category: p.category,
      likes: p.likedBy.length,
      liked: currentUserId ? p.likedBy.includes(currentUserId) : false,
      bookmarked: currentUserId ? p.bookmarkedBy.includes(currentUserId) : false,
      commentsCount: countComments(commentTree),
      shares: p.shares,
      views: p.views || 0,
      reportCount: p.reportCount || 0,
      timePosted: p.createdAt,
      editedAt: p.editedAt || null,
      comments: commentTree,
    };
  });
}

async function requireVerifiedUser(userId) {
  const customer = await Customer.findById(userId).lean().exec();
  if (!customer) return { ok: false, error: "Account not found." };
  if (customer.isSuspended) {
    return { ok: false, error: "Your account has been suspended." };
  }
  if (customer.isVerified !== true && customer.authProvider !== "google") {
    return { ok: false, error: "Verify your account to create posts." };
  }
  return { ok: true, customer };
}

async function createNotification({ userId, actorUserId, type, postId, commentId, message }) {
  if (!userId) return;
  if (actorUserId && String(userId) === String(actorUserId)) return;
  try {
    await CommunityNotification.create({ userId, actorUserId, type, postId, commentId, message });
  } catch (err) {
    console.error("notification create error", err.message);
  }
  // Bridge into the unified notification center (bell/badge/email/push) so
  // community activity also lands in the customer's consolidated feed.
  notificationService
    .bridgeCommunityNotification({ userId, actorUserId, type, postId, commentId, message })
    .catch((err) => console.error("community notification bridge error:", err.message));
}

async function notifyMentions(text, actorUserId, postId, commentId) {
  const tokens = extractMentions(text);
  if (!tokens.length) return;
  for (const token of tokens) {
    const lower = token.toLowerCase();
    const target = await Customer.findOne({
      $or: [
        { name: { $regex: new RegExp(`^${lower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") } },
        { email: { $regex: new RegExp(`^${lower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}@`, "i") } },
      ],
    }).lean().exec();
    if (target) {
      await createNotification({
        userId: target._id.toString(),
        actorUserId,
        type: "mention",
        postId,
        commentId,
        message: `mentioned you in a ${commentId ? "comment" : "post"}.`,
      });
    }
  }
}

// ===================== IMAGE UPLOAD ROUTE HELPER =====================

exports.uploadImage = (req, res) => {
  upload.single("image")(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || "Could not upload image." });
    }
    if (!req.file) {
      return res.status(400).json({ error: "No image file provided." });
    }
    res.status(201).json({ url: "/uploads/community/" + req.file.filename });
  });
};

// ===================== POSTS =====================

exports.createPost = async (req, res) => {
  try {
    const userId = req.userId;
    const lang = resolveLang(req);
    const { title, story, route, destination, travelDate, images, tips, tags, category } = req.body;
    if (!title || !story || !route || !destination || !travelDate || !category) {
      return res.status(400).json({ error: "Missing required fields." });
    }

    const verification = await requireVerifiedUser(userId);
    if (!verification.ok) {
      return res.status(403).json({ error: verification.error });
    }

    const mergedTags = [...new Set([...(tags || []), ...extractHashtags(`${title} ${story}`)])];
    const post = await CommunityPost.create({
      userId, title, story, route, destination, travelDate,
      images: images || [], tips: tips || [], tags: mergedTags, category,
      likesCount: 0, commentsCount: 0,
    });

    await notifyMentions(`${title} ${story}`, userId, post._id.toString(), null);

    const [enriched] = await enrichPosts([post], userId, lang);
    res.status(201).json(enriched);
  } catch (error) {
    console.error("error creating community post", error);
    res.status(500).json({ error: "Could not create post." });
  }
};

exports.updatePost = async (req, res) => {
  try {
    const userId = req.userId;
    const lang = resolveLang(req);
    const { title, story, route, destination, travelDate, images, tips, tags, category } = req.body;
    const post = await CommunityPost.findById(req.params.id).exec();
    if (!post) return res.status(404).json({ error: "Post not found." });
    if (post.userId !== userId) return res.status(403).json({ error: "You can only edit your own posts." });

    if (title) post.title = title;
    if (story) post.story = story;
    if (route) post.route = route;
    if (destination) post.destination = destination;
    if (travelDate) post.travelDate = travelDate;
    if (images !== undefined) post.images = images;
    if (tips !== undefined) post.tips = tips;
    if (tags !== undefined) post.tags = tags;
    if (category) post.category = category;
    post.editedAt = new Date();

    await post.save();
    const [enriched] = await enrichPosts([post.toObject()], userId, lang);
    res.status(200).json(enriched);
  } catch (error) {
    console.error("error updating community post", error);
    res.status(500).json({ error: "Could not update post." });
  }
};

exports.getPosts = async (req, res) => {
  try {
    const currentUserId = req.query.userId || null;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 5, 1), 30);

    const filter = { removedByAdmin: { $ne: true }, reportCount: { $lt: AUTO_HIDE_REPORT_THRESHOLD } };
    if (req.query.category) filter.category = req.query.category;
    if (req.query.route) filter.route = req.query.route;
    if (req.query.destination) filter.destination = req.query.destination;
    if (req.query.authorId) filter.userId = req.query.authorId;
    if (req.query.hashtag) filter.tags = req.query.hashtag.toLowerCase();
    if (req.query.likedByMe === "true" && currentUserId) filter.likedBy = currentUserId;
    if (req.query.bookmarkedByMe === "true" && currentUserId) filter.bookmarkedBy = currentUserId;
    if (req.query.search) {
      const term = req.query.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { title: { $regex: term, $options: "i" } },
        { story: { $regex: term, $options: "i" } },
        { route: { $regex: term, $options: "i" } },
        { destination: { $regex: term, $options: "i" } },
        { tags: { $regex: term, $options: "i" } },
      ];
    }

    const totalCount = await CommunityPost.countDocuments(filter);

    let query = CommunityPost.find(filter);
    switch (req.query.sort) {
      case "trending":
        query = query.sort({ likesCount: -1, views: -1 });
        break;
      case "topRated":
        query = query.sort({ likesCount: -1, shares: -1 });
        break;
      case "mostCommented":
        query = query.sort({ commentsCount: -1, createdAt: -1 });
        break;
      default:
        query = query.sort({ createdAt: -1 });
    }
    const posts = await query
      .skip((page - 1) * limit)
      .limit(limit)
      .lean()
      .exec();

    const enriched = await enrichPosts(posts, currentUserId);
    res.status(200).json({
      posts: enriched,
      page,
      limit,
      totalCount,
      hasMore: page * limit < totalCount,
    });
  } catch (error) {
    console.error("error fetching community posts", error);
    res.status(500).json({ error: "Could not load posts." });
  }
};

exports.getPostById = async (req, res) => {
  try {
    const currentUserId = req.query.userId || null;

    const post = await CommunityPost.findByIdAndUpdate(
      req.params.id,
      { $inc: { views: 1 } },
      { new: true }
    ).lean().exec();

    if (!post) return res.status(404).json({ error: "Post not found." });
    const [enriched] = await enrichPosts([post], currentUserId);
    res.status(200).json(enriched);
  } catch (error) {
    console.error("error fetching community post", error);
    res.status(500).json({ error: "Could not load post." });
  }
};

exports.getRelatedPosts = async (req, res) => {
  try {
    const post = await CommunityPost.findById(req.params.id).lean().exec();
    if (!post) return res.status(404).json({ error: "Post not found." });

    const related = await CommunityPost.find({
      _id: { $ne: post._id },
      removedByAdmin: { $ne: true },
      reportCount: { $lt: AUTO_HIDE_REPORT_THRESHOLD },
      $or: [
        { destination: post.destination },
        { category: post.category },
        { tags: { $in: post.tags || [] } },
      ],
    })
      .sort({ createdAt: -1 })
      .limit(3)
      .lean()
      .exec();

    const enriched = await enrichPosts(related, req.query.userId || null);
    res.status(200).json(enriched);
  } catch (error) {
    console.error("error fetching related posts", error);
    res.status(500).json({ error: "Could not load related posts." });
  }
};

exports.toggleLike = async (req, res) => {
  try {
    const userId = req.userId;
    const post = await CommunityPost.findById(req.params.id).exec();
    if (!post) return res.status(404).json({ error: "Post not found." });

    const alreadyLiked = post.likedBy.includes(userId);
    if (alreadyLiked) {
      post.likedBy = post.likedBy.filter((id) => id !== userId);
      post.likesCount = Math.max(0, (post.likesCount || 0) - 1);
    } else {
      post.likedBy.push(userId);
      post.likesCount = (post.likesCount || 0) + 1;
      await createNotification({
        userId: post.userId,
        actorUserId: userId,
        type: "like",
        postId: post._id.toString(),
        message: "liked your post.",
      });
    }
    await post.save();
    res.status(200).json({ likes: post.likedBy.length, liked: !alreadyLiked });
  } catch (error) {
    console.error("error toggling like", error);
    res.status(500).json({ error: "Could not update like." });
  }
};

exports.toggleBookmark = async (req, res) => {
  try {
    const userId = req.userId;
    const post = await CommunityPost.findById(req.params.id).exec();
    if (!post) return res.status(404).json({ error: "Post not found." });

    const alreadyBookmarked = post.bookmarkedBy.includes(userId);
    if (alreadyBookmarked) {
      post.bookmarkedBy = post.bookmarkedBy.filter((id) => id !== userId);
    } else {
      post.bookmarkedBy.push(userId);
    }
    await post.save();
    res.status(200).json({ bookmarked: !alreadyBookmarked });
  } catch (error) {
    console.error("error toggling bookmark", error);
    res.status(500).json({ error: "Could not update bookmark." });
  }
};

exports.incrementShare = async (req, res) => {
  try {
    const post = await CommunityPost.findByIdAndUpdate(
      req.params.id,
      { $inc: { shares: 1 } },
      { new: true }
    ).exec();
    if (!post) return res.status(404).json({ error: "Post not found." });
    res.status(200).json({ shares: post.shares });
  } catch (error) {
    console.error("error incrementing share", error);
    res.status(500).json({ error: "Could not update share count." });
  }
};

exports.deletePost = async (req, res) => {
  try {
    const userId = req.userId;
    const post = await CommunityPost.findById(req.params.id).exec();
    if (!post) return res.status(404).json({ error: "Post not found." });
    if (post.userId !== userId) return res.status(403).json({ error: "You can only delete your own posts." });

    removeUploadedImages(post.images);
    await CommunityPost.deleteOne({ _id: req.params.id });
    await CommunityComment.deleteMany({ postId: req.params.id });
    res.status(200).json({ message: "Post deleted." });
  } catch (error) {
    console.error("error deleting post", error);
    res.status(500).json({ error: "Could not delete post." });
  }
};

// ===================== FILTER OPTIONS =====================

exports.getFilterOptions = async (req, res) => {
  try {
    const routes = await CommunityPost.distinct("route", { removedByAdmin: { $ne: true } });
    const destinations = await CommunityPost.distinct("destination", { removedByAdmin: { $ne: true } });
    res.status(200).json({ routes: routes.sort(), destinations: destinations.sort() });
  } catch (error) {
    console.error("error fetching filter options", error);
    res.status(500).json({ error: "Could not load filter options." });
  }
};

// ===================== COMMENTS =====================

exports.addComment = async (req, res) => {
  try {
    const userId = req.userId;
    const { content, parentCommentId } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: "Comment content is required." });
    }

    const post = await CommunityPost.findById(req.params.postId).exec();
    if (!post) return res.status(404).json({ error: "Post not found." });

    const comment = await CommunityComment.create({
      postId: req.params.postId,
      userId,
      content,
      parentCommentId: parentCommentId || null,
    });

    post.commentsCount = (post.commentsCount || 0) + 1;
    await post.save();

    await createNotification({
      userId: post.userId,
      actorUserId: userId,
      type: parentCommentId ? "reply" : "comment",
      postId: post._id.toString(),
      commentId: comment._id.toString(),
      message: parentCommentId ? "replied to a comment on your post." : "commented on your post.",
    });
    await notifyMentions(content, userId, req.params.postId, comment._id.toString());

    const postObj = post.toObject();
    const [enriched] = await enrichPosts([postObj], userId);
    res.status(201).json(enriched);
  } catch (error) {
    console.error("error adding comment", error);
    res.status(500).json({ error: "Could not add comment." });
  }
};

exports.toggleLikeComment = async (req, res) => {
  try {
    const userId = req.userId;
    const comment = await CommunityComment.findById(req.params.commentId).exec();
    if (!comment) return res.status(404).json({ error: "Comment not found." });

    const alreadyLiked = comment.likedBy.includes(userId);
    comment.likedBy = alreadyLiked
      ? comment.likedBy.filter((id) => id !== userId)
      : [...comment.likedBy, userId];
    await comment.save();

    if (!alreadyLiked) {
      await createNotification({
        userId: comment.userId,
        actorUserId: userId,
        type: "like",
        postId: comment.postId,
        commentId: comment._id.toString(),
        message: "liked your comment.",
      });
    }
    res.status(200).json({ likes: comment.likedBy.length, liked: !alreadyLiked });
  } catch (error) {
    console.error("error toggling comment like", error);
    res.status(500).json({ error: "Could not update comment like." });
  }
};

exports.editComment = async (req, res) => {
  try {
    const userId = req.userId;
    const { content } = req.body;
    const comment = await CommunityComment.findById(req.params.commentId).exec();
    if (!comment) return res.status(404).json({ error: "Comment not found." });
    if (comment.userId !== userId) return res.status(403).json({ error: "You can only edit your own comments." });

    comment.content = content;
    comment.edited = true;
    await comment.save();
    res.status(200).json({ message: "Comment updated." });
  } catch (error) {
    console.error("error editing comment", error);
    res.status(500).json({ error: "Could not edit comment." });
  }
};

exports.deleteComment = async (req, res) => {
  try {
    const userId = req.userId;
    const lang = resolveLang(req);
    const comment = await CommunityComment.findById(req.params.commentId).exec();
    if (!comment) return res.status(404).json({ error: "Comment not found." });
    if (comment.userId !== userId) return res.status(403).json({ error: "You can only delete your own comments." });

    comment.deleted = true;
    comment.content = t(lang, "community.deletedContent");
    await comment.save();

    await CommunityPost.findByIdAndUpdate(comment.postId, { $inc: { commentsCount: -1 } }).exec();

    res.status(200).json({ message: "Comment deleted." });
  } catch (error) {
    console.error("error deleting comment", error);
    res.status(500).json({ error: "Could not delete comment." });
  }
};

// ===================== FOLLOW SYSTEM =====================

exports.followUser = async (req, res) => {
  try {
    const followerId = req.userId;
    const followingId = req.params.id;
    if (followerId === followingId) {
      return res.status(400).json({ error: "You cannot follow yourself." });
    }
    const target = await Customer.findById(followingId).lean().exec();
    if (!target) return res.status(404).json({ error: "User not found." });

    const existing = await CommunityFollow.findOne({ followerId, followingId }).lean().exec();
    if (!existing) {
      await CommunityFollow.create({ followerId, followingId });
      await createNotification({
        userId: followingId,
        actorUserId: followerId,
        type: "follow",
        message: "started following you.",
      });
    }
    const { followers: followerCount, following: followingCount } = await getFollowCounts(followingId);
    res.status(200).json({ following: true, followerCount, followingCount });
  } catch (error) {
    console.error("error following user", error);
    res.status(500).json({ error: "Could not follow user." });
  }
};

exports.unfollowUser = async (req, res) => {
  try {
    const followerId = req.userId;
    const followingId = req.params.id;
    await CommunityFollow.deleteOne({ followerId, followingId });
    const { followers: followerCount, following: followingCount } = await getFollowCounts(followingId);
    res.status(200).json({ following: false, followerCount, followingCount });
  } catch (error) {
    console.error("error unfollowing user", error);
    res.status(500).json({ error: "Could not unfollow user." });
  }
};

exports.getFollowers = async (req, res) => {
  try {
    const userId = req.params.id;
    const currentUserId = req.query.userId || null;
    const docs = await CommunityFollow.find({ followingId: userId }).sort({ createdAt: -1 }).limit(50).lean().exec();
    const followerIds = docs.map((d) => d.followerId);
    const userMap = await getUserMap(followerIds);
    res.status(200).json(followerIds.map((id) => userMap[id]).filter(Boolean));
  } catch (error) {
    console.error("error fetching followers", error);
    res.status(500).json({ error: "Could not load followers." });
  }
};

exports.getFollowing = async (req, res) => {
  try {
    const userId = req.params.id;
    const docs = await CommunityFollow.find({ followerId: userId }).sort({ createdAt: -1 }).limit(50).lean().exec();
    const followingIds = docs.map((d) => d.followingId);
    const userMap = await getUserMap(followingIds);
    res.status(200).json(followingIds.map((id) => userMap[id]).filter(Boolean));
  } catch (error) {
    console.error("error fetching following", error);
    res.status(500).json({ error: "Could not load following." });
  }
};

exports.getSuggestedUsers = async (req, res) => {
  try {
    const currentUserId = req.userId;
    const followingIds = await getFollowingIds(currentUserId);

    const contributors = await CommunityPost.aggregate([
      { $match: { removedByAdmin: { $ne: true } } },
      { $group: { _id: "$userId", score: { $sum: { $add: [{ $size: "$likedBy" }, 5] } } } },
      { $sort: { score: -1 } },
      { $limit: 20 },
    ]);
    const ids = contributors.map((c) => c._id).filter((id) => id !== currentUserId && !followingIds.includes(id));
    const suggested = await Customer.find({ _id: { $in: ids }, isSuspended: { $ne: true } }).limit(6).lean().exec();
    const userMap = await getUserMap(suggested.map((s) => s._id.toString()));
    res.status(200).json(suggested.map((s) => userMap[s._id.toString()]).filter(Boolean));
  } catch (error) {
    console.error("error fetching suggested users", error);
    res.status(500).json({ error: "Could not load suggested users." });
  }
};

exports.getUserProfile = async (req, res) => {
  try {
    const userId = req.params.id;
    const currentUserId = req.query.userId || null;
    const customer = await Customer.findById(userId).lean().exec();
    if (!customer) return res.status(404).json({ error: "User not found." });

    const statsAgg = await CommunityPost.aggregate([
      { $match: { userId, removedByAdmin: { $ne: true } } },
      { $group: { _id: "$userId", postsCount: { $sum: 1 }, totalLikes: { $sum: { $size: "$likedBy" } } } },
    ]);
    const stats = statsAgg[0];
    const followCounts = await getFollowCounts(userId);
    const followingIds = await getFollowingIds(currentUserId);
    const isFollowing = currentUserId ? followingIds.includes(userId) : false;

    res.status(200).json(
      toPublicUser(customer, stats, { ...followCounts, isFollowing })
    );
  } catch (error) {
    console.error("error fetching user profile", error);
    res.status(500).json({ error: "Could not load profile." });
  }
};

exports.getMyProfile = async (req, res) => {
  try {
    const userId = req.userId;
    const customer = await Customer.findById(userId).lean().exec();
    if (!customer) return res.status(404).json({ error: "Account not found." });

    const statsAgg = await CommunityPost.aggregate([
      { $match: { userId, removedByAdmin: { $ne: true } } },
      { $group: { _id: "$userId", postsCount: { $sum: 1 }, totalLikes: { $sum: { $size: "$likedBy" } } } },
    ]);
    const stats = statsAgg[0];
    const followCounts = await getFollowCounts(userId);
    const pendingReports = await CommunityReport.countDocuments({ targetUserId: userId, status: "pending" });

    res.status(200).json({
      ...toPublicUser(customer, stats, followCounts),
      email: customer.email,
      isAdmin: customer.isAdmin === true,
      isSuspended: customer.isSuspended === true,
      pendingReports,
    });
  } catch (error) {
    console.error("error fetching my profile", error);
    res.status(500).json({ error: "Could not load profile." });
  }
};

exports.updateMyProfile = async (req, res) => {
  try {
    const userId = req.userId;
    const customer = await Customer.findById(userId).exec();
    if (!customer) return res.status(404).json({ error: "Account not found." });

    const { name, bio, location, profilePicture, coverImage } = req.body;
    if (typeof name === "string" && name.trim()) customer.name = name.trim().slice(0, 80);
    if (typeof bio === "string") customer.bio = bio.slice(0, 500);
    if (typeof location === "string") customer.location = location.slice(0, 120);
    if (typeof profilePicture === "string" && profilePicture.startsWith("/uploads/")) customer.profilePicture = profilePicture;
    if (typeof coverImage === "string" && coverImage.startsWith("/uploads/")) customer.coverImage = coverImage;

    await customer.save();
    const customerDoc = await Customer.findById(userId).lean().exec();
    const statsAgg = await CommunityPost.aggregate([
      { $match: { userId, removedByAdmin: { $ne: true } } },
      { $group: { _id: "$userId", postsCount: { $sum: 1 }, totalLikes: { $sum: { $size: "$likedBy" } } } },
    ]);
    const followCounts = await getFollowCounts(userId);
    res.status(200).json({ ...toPublicUser(customerDoc, statsAgg[0], followCounts), email: customerDoc.email });
  } catch (error) {
    console.error("error updating profile", error);
    res.status(500).json({ error: "Could not update profile." });
  }
};

// ===================== SEARCH =====================

exports.search = async (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    const currentUserId = req.query.userId || null;
    if (!q) return res.status(200).json({ users: [], posts: [], destinations: [], hashtags: [] });

    const limit = Math.min(parseInt(req.query.limit, 10) || 5, 10);
    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

    const [customers, posts, destinations, hashtags] = await Promise.all([
      Customer.find({
        $or: [{ name: regex }, { email: regex }, { location: regex }],
        isSuspended: { $ne: true },
      }).limit(limit).lean().exec(),
      CommunityPost.find({
        removedByAdmin: { $ne: true },
        reportCount: { $lt: AUTO_HIDE_REPORT_THRESHOLD },
        $or: [{ title: regex }, { story: regex }, { destination: regex }, { route: regex }, { tags: regex }],
      }).sort({ createdAt: -1 }).limit(limit).lean().exec(),
      CommunityPost.aggregate([
        { $match: { removedByAdmin: { $ne: true }, destination: regex } },
        { $group: { _id: "$destination", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: limit },
      ]),
      CommunityPost.aggregate([
        { $match: { removedByAdmin: { $ne: true }, tags: regex } },
        { $unwind: "$tags" },
        { $match: { tags: regex } },
        { $group: { _id: "$tags", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: limit },
      ]),
    ]);

    const userMap = await getUserMap(customers.map((c) => c._id.toString()));
    const enriched = await enrichPosts(posts, currentUserId);

    res.status(200).json({
      users: customers.map((c) => userMap[c._id.toString()]).filter(Boolean),
      posts: enriched,
      destinations: destinations.map((d) => ({ name: d._id, count: d.count })),
      hashtags: hashtags.map((h) => ({ name: h._id, count: h.count })),
    });
  } catch (error) {
    console.error("error searching community", error);
    res.status(500).json({ error: "Could not search community." });
  }
};

// ===================== TRENDING HASHTAGS =====================

exports.getTrendingHashtags = async (req, res) => {
  try {
    const results = await CommunityPost.aggregate([
      { $match: { removedByAdmin: { $ne: true }, tags: { $ne: [] } } },
      { $unwind: "$tags" },
      { $group: { _id: "$tags", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);
    res.status(200).json(results.map((r) => ({ name: r._id, count: r.count })));
  } catch (error) {
    console.error("error computing trending hashtags", error);
    res.status(500).json({ error: "Could not load trending hashtags." });
  }
};

// ===================== NOTIFICATIONS =====================

exports.getNotifications = async (req, res) => {
  try {
    const userId = req.userId;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 15, 1), 50);

    const totalCount = await CommunityNotification.countDocuments({ userId });
    const notifications = await CommunityNotification.find({ userId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean()
      .exec();

    const actorIds = notifications.map((n) => n.actorUserId).filter(Boolean);
    const userMap = await getUserMap(actorIds);

    res.status(200).json({
      notifications: notifications.map((n) => ({
        id: n._id.toString(),
        actor: n.actorUserId ? userMap[n.actorUserId] || toPublicUser(null) : null,
        type: n.type,
        postId: n.postId,
        commentId: n.commentId,
        message: n.message,
        read: n.read,
        timePosted: n.createdAt,
      })),
      totalCount,
      page,
      limit,
      hasMore: page * limit < totalCount,
      unreadCount: await CommunityNotification.countDocuments({ userId, read: false }),
    });
  } catch (error) {
    console.error("error fetching notifications", error);
    res.status(500).json({ error: "Could not load notifications." });
  }
};

exports.getUnreadNotificationCount = async (req, res) => {
  try {
    const count = await CommunityNotification.countDocuments({ userId: req.userId, read: false });
    res.status(200).json({ count });
  } catch (error) {
    console.error("error fetching unread count", error);
    res.status(500).json({ error: "Could not load unread count." });
  }
};

exports.markNotificationRead = async (req, res) => {
  try {
    await CommunityNotification.updateOne({ _id: req.params.id, userId: req.userId }, { $set: { read: true } });
    res.status(200).json({ message: "Notification marked as read." });
  } catch (error) {
    console.error("error marking notification read", error);
    res.status(500).json({ error: "Could not update notification." });
  }
};

exports.markAllNotificationsRead = async (req, res) => {
  try {
    await CommunityNotification.updateMany({ userId: req.userId, read: false }, { $set: { read: true } });
    res.status(200).json({ message: "All notifications marked as read." });
  } catch (error) {
    console.error("error marking all notifications read", error);
    res.status(500).json({ error: "Could not update notifications." });
  }
};

// ===================== REPORTS =====================

exports.reportPost = async (req, res) => {
  try {
    const reporterUserId = req.userId;
    const postId = req.params.id;
    const { reason, details } = req.body;

    const reasonMap = {
      "spam": "Spam", "Spam": "Spam",
      "abuse": "Abuse", "Abuse": "Abuse",
      "fakeInfo": "Fake Information", "Fake Information": "Fake Information",
      "harassment": "Harassment", "Harassment": "Harassment",
      "other": "Other", "Other": "Other",
    };
    const normalizedReason = reasonMap[reason];
    if (!normalizedReason) {
      return res.status(400).json({ error: "A valid report reason is required." });
    }

    const post = await CommunityPost.findById(postId).exec();
    if (!post) return res.status(404).json({ error: "Post not found." });
    if (String(post.userId) === String(reporterUserId)) {
      return res.status(400).json({ error: "You cannot report your own post." });
    }

    const existing = await CommunityReport.findOne({ reporterUserId, postId }).lean().exec();
    if (existing) {
      return res.status(409).json({ error: "You have already reported this post." });
    }

    await CommunityReport.create({ reporterUserId, postId, targetUserId: post.userId, reason: normalizedReason, details: details || "" });
    post.reportCount = (post.reportCount || 0) + 1;
    await post.save();

    res.status(201).json({ message: "Post reported. Our moderation team will review it." });
  } catch (error) {
    console.error("error reporting post", error);
    res.status(500).json({ error: "Could not report post." });
  }
};

exports.reportComment = async (req, res) => {
  try {
    const reporterUserId = req.userId;
    const commentId = req.params.commentId;
    const { reason, details } = req.body;

    const reasonMap = {
      "spam": "Spam", "Spam": "Spam",
      "abuse": "Abuse", "Abuse": "Abuse",
      "fakeInfo": "Fake Information", "Fake Information": "Fake Information",
      "harassment": "Harassment", "Harassment": "Harassment",
      "other": "Other", "Other": "Other",
    };
    const normalizedReason = reasonMap[reason];
    if (!normalizedReason) {
      return res.status(400).json({ error: "A valid report reason is required." });
    }

    const comment = await CommunityComment.findById(commentId).exec();
    if (!comment) return res.status(404).json({ error: "Comment not found." });
    if (String(comment.userId) === String(reporterUserId)) {
      return res.status(400).json({ error: "You cannot report your own comment." });
    }

    const existing = await CommunityReport.findOne({ reporterUserId, commentId }).lean().exec();
    if (existing) {
      return res.status(409).json({ error: "You have already reported this comment." });
    }

    await CommunityReport.create({
      reporterUserId,
      commentId,
      postId: comment.postId,
      targetUserId: comment.userId,
      reason: normalizedReason,
      details: details || "",
    });

    res.status(201).json({ message: "Comment reported. Our moderation team will review it." });
  } catch (error) {
    console.error("error reporting comment", error);
    res.status(500).json({ error: "Could not report comment." });
  }
};

// ===================== REAL AGGREGATED STATS =====================

exports.getTrendingRoutes = async (req, res) => {
  try {
    const results = await CommunityPost.aggregate([
      { $match: { removedByAdmin: { $ne: true } } },
      { $group: { _id: "$route", postsCount: { $sum: 1 } } },
      { $sort: { postsCount: -1 } },
      { $limit: 5 },
    ]);
    res.status(200).json(results.map((r) => ({ route: r._id, postsCount: r.postsCount })));
  } catch (error) {
    console.error("error computing trending routes", error);
    res.status(500).json({ error: "Could not load trending routes." });
  }
};

exports.getPopularDestinations = async (req, res) => {
  try {
    const results = await CommunityPost.aggregate([
      { $match: { removedByAdmin: { $ne: true } } },
      { $group: { _id: "$destination", postsCount: { $sum: 1 }, sampleImage: { $first: "$images" } } },
      { $sort: { postsCount: -1 } },
      { $limit: 4 },
    ]);
    res.status(200).json(
      results.map((r) => ({
        name: r._id,
        postsCount: r.postsCount,
        image: (r.sampleImage && r.sampleImage[0]) || "",
      }))
    );
  } catch (error) {
    console.error("error computing popular destinations", error);
    res.status(500).json({ error: "Could not load popular destinations." });
  }
};

exports.getTopContributors = async (req, res) => {
  try {
    const results = await CommunityPost.aggregate([
      { $match: { removedByAdmin: { $ne: true } } },
      {
        $group: {
          _id: "$userId",
          postsCount: { $sum: 1 },
          totalLikes: { $sum: { $size: "$likedBy" } },
        },
      },
      { $addFields: { points: { $add: ["$totalLikes", { $multiply: ["$postsCount", 10] }] } } },
      { $sort: { points: -1 } },
      { $limit: 5 },
    ]);

    const userMap = await getUserMap(results.map((r) => r._id));
    res.status(200).json(
      results.map((r) => ({
        user: userMap[r._id] || toPublicUser(null),
        points: r.points,
      }))
    );
  } catch (error) {
    console.error("error computing top contributors", error);
    res.status(500).json({ error: "Could not load top contributors." });
  }
};

// ===================== ADMIN MODERATION =====================

exports.getReportedPosts = async (req, res) => {
  try {
    const posts = await CommunityPost.find({ reportCount: { $gt: 0 } })
      .sort({ reportCount: -1, createdAt: -1 })
      .limit(50)
      .lean()
      .exec();
    const enriched = await enrichPosts(posts, null);
    res.status(200).json(enriched);
  } catch (error) {
    console.error("error fetching reported posts", error);
    res.status(500).json({ error: "Could not load reported posts." });
  }
};

exports.getRecentReports = async (req, res) => {
  try {
    const reports = await CommunityReport.find().sort({ createdAt: -1 }).limit(30).lean().exec();
    const reporterIds = reports.map((r) => r.reporterUserId).filter(Boolean);
    const targetIds = reports.map((r) => r.targetUserId).filter(Boolean);
    const userMap = await getUserMap([...reporterIds, ...targetIds]);

    const postIds = reports.map((r) => r.postId).filter(Boolean);
    const postMap = {};
    const posts = await CommunityPost.find({ _id: { $in: postIds } }).lean().exec();
    posts.forEach((p) => { postMap[p._id.toString()] = p; });

    res.status(200).json(
      reports.map((r) => ({
        id: r._id.toString(),
        reporter: userMap[r.reporterUserId] || toPublicUser(null),
        targetUser: r.targetUserId ? userMap[r.targetUserId] || toPublicUser(null) : null,
        postId: r.postId,
        postTitle: postMap[r.postId]?.title || null,
        reason: r.reason,
        details: r.details,
        status: r.status,
        timePosted: r.createdAt,
      }))
    );
  } catch (error) {
    console.error("error fetching recent reports", error);
    res.status(500).json({ error: "Could not load reports." });
  }
};

exports.getReportedUsers = async (req, res) => {
  try {
    const reports = await CommunityReport.find({ status: "pending" }).lean().exec();
    const targetIds = [...new Set(reports.map((r) => r.targetUserId).filter(Boolean))];
    const customers = await Customer.find({ _id: { $in: targetIds } }).lean().exec();
    const userMap = await getUserMap(targetIds);

    const results = [];
    for (const id of targetIds) {
      const userReports = reports.filter((r) => r.targetUserId === id);
      const suspended = customers.find((c) => c._id.toString() === id)?.isSuspended === true;
      results.push({
        user: userMap[id] || toPublicUser(null),
        reportCount: userReports.length,
        reasons: [...new Set(userReports.map((r) => r.reason))],
        suspended,
      });
    }
    results.sort((a, b) => b.reportCount - a.reportCount);
    res.status(200).json(results);
  } catch (error) {
    console.error("error fetching reported users", error);
    res.status(500).json({ error: "Could not load reported users." });
  }
};

exports.getUnverifiedUsers = async (req, res) => {
  try {
    const customers = await Customer.find({
      authProvider: "email",
      isVerified: { $ne: true },
      isSuspended: { $ne: true },
    }).lean().exec();

    const userMap = await getUserMap(customers.map((c) => c._id.toString()));
    const results = customers.map((c) => ({
      user: userMap[c._id.toString()] || toPublicUser(null),
      email: c.email,
      provider: c.authProvider,
    }));
    results.sort((a, b) => (b.user.joinedAt ? new Date(b.user.joinedAt).getTime() : 0) - (a.user.joinedAt ? new Date(a.user.joinedAt).getTime() : 0));
    res.status(200).json(results);
  } catch (error) {
    console.error("error fetching unverified users", error);
    res.status(500).json({ error: "Could not load unverified users." });
  }
};

exports.moderatePost = async (req, res) => {
  try {
    const { action } = req.body; // 'dismiss' | 'remove' | 'restore'
    const post = await CommunityPost.findById(req.params.id).exec();
    if (!post) return res.status(404).json({ error: "Post not found." });

    if (action === "remove") {
      post.removedByAdmin = true;
      await post.save();
      await CommunityReport.updateMany({ postId: req.params.id, status: "pending" }, { $set: { status: "actioned" } });
    } else if (action === "restore") {
      post.removedByAdmin = false;
      await post.save();
    } else if (action === "dismiss") {
      post.reportCount = 0;
      await post.save();
      await CommunityReport.updateMany({ postId: req.params.id }, { $set: { status: "dismissed" } });
    } else {
      return res.status(400).json({ error: "action must be 'dismiss', 'remove' or 'restore'." });
    }
    res.status(200).json({ message: "Moderation action applied." });
  } catch (error) {
    console.error("error moderating post", error);
    res.status(500).json({ error: "Could not apply moderation action." });
  }
};

exports.moderateUser = async (req, res) => {
  try {
    const { action } = req.body; // 'suspend' | 'restore'
    const customer = await Customer.findById(req.params.id).exec();
    if (!customer) return res.status(404).json({ error: "User not found." });

    if (action === "suspend") {
      customer.isSuspended = true;
    } else if (action === "restore") {
      customer.isSuspended = false;
    } else {
      return res.status(400).json({ error: "action must be 'suspend' or 'restore'." });
    }
    await customer.save();

    if (action === "suspend") {
      await createNotification({
        userId: customer._id.toString(),
        actorUserId: null,
        type: "system",
        message: "Your account has been suspended. Contact support for assistance.",
      });
    }
    res.status(200).json({ message: `User ${action === "suspend" ? "suspended" : "restored"}.` });
  } catch (error) {
    console.error("error moderating user", error);
    res.status(500).json({ error: "Could not update user." });
  }
};

exports.verifyUser = async (req, res) => {
  try {
    const { action } = req.body; // 'approve' | 'revoke'
    const customer = await Customer.findById(req.params.id).exec();
    if (!customer) return res.status(404).json({ error: "User not found." });

    if (action === "approve") {
      customer.isVerified = true;
    } else if (action === "revoke") {
      customer.isVerified = false;
    } else {
      return res.status(400).json({ error: "action must be 'approve' or 'revoke'." });
    }
    await customer.save();

    if (action === "approve") {
      await createNotification({
        userId: customer._id.toString(),
        actorUserId: null,
        type: "verification_approved",
        message: "Your community verification was approved. You can now create posts.",
      });
    }
    res.status(200).json({ message: `Verification ${action === "approve" ? "approved" : "revoked"}.` });
  } catch (error) {
    console.error("error updating verification", error);
    res.status(500).json({ error: "Could not update verification." });
  }
};

exports.getCommunityStats = async (req, res) => {
  try {
    const [
      totalUsers,
      totalPosts,
      activePosts,
      totalComments,
      totalLikes,
      pendingReports,
      totalFollows,
      totalBookmarks,
    ] = await Promise.all([
      Customer.countDocuments(),
      CommunityPost.countDocuments(),
      CommunityPost.countDocuments({ removedByAdmin: { $ne: true } }),
      CommunityComment.countDocuments({ deleted: { $ne: true } }),
      CommunityPost.aggregate([{ $group: { _id: null, likes: { $sum: { $size: "$likedBy" } } } }]),
      CommunityReport.countDocuments({ status: "pending" }),
      CommunityFollow.countDocuments(),
      CommunityPost.aggregate([{ $group: { _id: null, bookmarks: { $sum: { $size: "$bookmarkedBy" } } } }]),
    ]);

    res.status(200).json({
      totalUsers,
      totalPosts,
      activePosts,
      totalComments,
      totalLikes: totalLikes[0]?.likes || 0,
      totalBookmarks: totalBookmarks[0]?.bookmarks || 0,
      pendingReports,
      totalFollows,
    });
  } catch (error) {
    console.error("error computing community stats", error);
    res.status(500).json({ error: "Could not load community statistics." });
  }
};
