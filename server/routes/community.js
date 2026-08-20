const express = require("express");
const router = express.Router();
const community = require("../controller/community");
const { requireAuth, requireAdmin } = require("../middleware/auth");

// Image upload (protected)
router.post("/community/upload", requireAuth, community.uploadImage);

// Posts
router.post("/community/posts", requireAuth, community.createPost);
router.get("/community/posts", community.getPosts);
router.get("/community/posts/:id", community.getPostById);
router.get("/community/posts/:id/related", community.getRelatedPosts);
router.put("/community/posts/:id", requireAuth, community.updatePost);
router.post("/community/posts/:id/like", requireAuth, community.toggleLike);
router.post("/community/posts/:id/bookmark", requireAuth, community.toggleBookmark);
router.post("/community/posts/:id/share", requireAuth, community.incrementShare);
router.post("/community/posts/:id/report", requireAuth, community.reportPost);
router.delete("/community/posts/:id", requireAuth, community.deletePost);

// Filters & discovery
router.get("/community/filter-options", community.getFilterOptions);
router.get("/community/hashtags/trending", community.getTrendingHashtags);
router.get("/community/search", community.search);

// Comments
router.post("/community/posts/:postId/comments", requireAuth, community.addComment);
router.post("/community/comments/:commentId/like", requireAuth, community.toggleLikeComment);
router.put("/community/comments/:commentId", requireAuth, community.editComment);
router.delete("/community/comments/:commentId", requireAuth, community.deleteComment);
router.post("/community/comments/:commentId/report", requireAuth, community.reportComment);

// Users / follow system
router.get("/community/users/suggested", requireAuth, community.getSuggestedUsers);
router.get("/community/users/:id", community.getUserProfile);
router.get("/community/users/:id/followers", community.getFollowers);
router.get("/community/users/:id/following", community.getFollowing);
router.post("/community/users/:id/follow", requireAuth, community.followUser);
router.post("/community/users/:id/unfollow", requireAuth, community.unfollowUser);
router.get("/community/me", requireAuth, community.getMyProfile);
router.put("/community/me", requireAuth, community.updateMyProfile);

// Notifications
router.get("/community/notifications", requireAuth, community.getNotifications);
router.get("/community/notifications/unread-count", requireAuth, community.getUnreadNotificationCount);
router.post("/community/notifications/read-all", requireAuth, community.markAllNotificationsRead);
router.post("/community/notifications/:id/read", requireAuth, community.markNotificationRead);

// Real aggregated stats
router.get("/community/stats/trending-routes", community.getTrendingRoutes);
router.get("/community/stats/popular-destinations", community.getPopularDestinations);
router.get("/community/stats/top-contributors", community.getTopContributors);

// Admin moderation
router.get("/community/admin/reports", requireAdmin, community.getRecentReports);
router.get("/community/admin/reported-posts", requireAdmin, community.getReportedPosts);
router.get("/community/admin/reported-users", requireAdmin, community.getReportedUsers);
router.get("/community/admin/unverified-users", requireAdmin, community.getUnverifiedUsers);
router.get("/community/admin/stats", requireAdmin, community.getCommunityStats);
router.post("/community/admin/posts/:id/moderate", requireAdmin, community.moderatePost);
router.post("/community/admin/users/:id/moderate", requireAdmin, community.moderateUser);
router.post("/community/admin/users/:id/verify", requireAdmin, community.verifyUser);

module.exports = router;
