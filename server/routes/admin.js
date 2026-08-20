const express = require("express");
const router = express.Router();
const { requireAdminAuth } = require("../middleware/adminAuth");
const admin = require("../controller/admin");

// Every /admin/* endpoint below is protected by the separate admin JWT.
// Customer sessions are rejected with 403 by requireAdminAuth.

// Dashboard
router.get("/admin/dashboard/stats", requireAdminAuth, admin.getDashboardStats);

// Users
router.get("/admin/users", requireAdminAuth, admin.listUsers);
router.get("/admin/users/:id", requireAdminAuth, admin.getUser);
router.put("/admin/users/:id/update", requireAdminAuth, admin.updateUser);
router.delete("/admin/users/:id", requireAdminAuth, admin.deleteUser);

// Buses
router.get("/admin/buses", requireAdminAuth, admin.listBuses);
router.post("/admin/buses", requireAdminAuth, admin.createBus);
router.put("/admin/buses/:id", requireAdminAuth, admin.updateBus);
router.delete("/admin/buses/:id", requireAdminAuth, admin.deleteBus);

// Routes
router.get("/admin/routes", requireAdminAuth, admin.listRoutes);
router.post("/admin/routes", requireAdminAuth, admin.createRoute);
router.put("/admin/routes/:id", requireAdminAuth, admin.updateRoute);
router.delete("/admin/routes/:id", requireAdminAuth, admin.deleteRoute);

// Drivers
router.get("/admin/drivers", requireAdminAuth, admin.listDrivers);
router.post("/admin/drivers", requireAdminAuth, admin.createDriver);
router.put("/admin/drivers/:id", requireAdminAuth, admin.updateDriver);
router.delete("/admin/drivers/:id", requireAdminAuth, admin.deleteDriver);

// Bookings
router.get("/admin/bookings", requireAdminAuth, admin.listBookings);
router.get("/admin/bookings/:id", requireAdminAuth, admin.getBooking);
router.put("/admin/bookings/:id/cancel", requireAdminAuth, admin.cancelBooking);

// Cancellations
router.get("/admin/cancellations", requireAdminAuth, admin.listCancellations);

// Payments
router.get("/admin/payments", requireAdminAuth, admin.listPayments);
router.get("/admin/payment-settings", requireAdminAuth, admin.getPaymentSettings);
router.put("/admin/payment-settings", requireAdminAuth, admin.updatePaymentSettings);

// Community Moderation
router.get("/admin/community/reports", requireAdminAuth, admin.listReports);
router.put("/admin/community/reports/:id/status", requireAdminAuth, admin.updateReport);
router.get("/admin/community/posts", requireAdminAuth, admin.listCommunityPosts);
router.put("/admin/community/posts/:id/moderate", requireAdminAuth, admin.moderatePost);
router.get("/admin/community/comments", requireAdminAuth, admin.listComments);
router.put("/admin/community/comments/:id/moderate", requireAdminAuth, admin.moderateComment);
router.get("/admin/community/stats", requireAdminAuth, admin.getCommunityStats);
router.get("/admin/community/moderation-log", requireAdminAuth, admin.getModerationLog);

// Reviews
router.get("/admin/reviews", requireAdminAuth, admin.listReviews);
router.put("/admin/reviews/:id/status", requireAdminAuth, admin.updateReview);
router.delete("/admin/reviews/:id", requireAdminAuth, admin.deleteReview);

// Notifications
router.get("/admin/notifications/stats", requireAdminAuth, admin.notificationStats);
router.get("/admin/notifications", requireAdminAuth, admin.notificationList);
router.post("/admin/notifications/offer", requireAdminAuth, admin.sendOffer);
router.post("/admin/notifications/coupon", requireAdminAuth, admin.sendCoupon);
router.post("/admin/notifications/bus-status", requireAdminAuth, admin.sendBusStatus);

// Analytics
router.get("/admin/analytics", requireAdminAuth, admin.getAnalytics);

// Reports
router.get("/admin/reports/:type", requireAdminAuth, admin.generateReport);

module.exports = router;
