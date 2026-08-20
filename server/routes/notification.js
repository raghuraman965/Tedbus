const express = require("express");
const router = express.Router();
const { requireAuth, requireAdmin } = require("../middleware/auth");
const ctrl = require("../controller/notification");

router.get("/notifications/preferences", requireAuth, ctrl.getPreferences);
router.put("/notifications/preferences", requireAuth, ctrl.updatePreferences);

router.get("/notifications/push-public-key", ctrl.getPushPublicKey);
router.get("/notifications/push-status", requireAuth, ctrl.getPushStatus);
router.post("/notifications/push-subscription", requireAuth, ctrl.registerPushSubscription);
router.delete("/notifications/push-subscription", requireAuth, ctrl.removePushSubscription);
router.post("/notifications/test-push", requireAuth, ctrl.testPush);

router.get("/notifications/unread-count", requireAuth, ctrl.getUnreadCount);
router.get("/notifications", requireAuth, ctrl.getNotifications);
router.post("/notifications/read-all", requireAuth, ctrl.markAllRead);
router.post("/notifications/:id/retry", requireAuth, ctrl.retryNotification);
router.get("/notifications/:id", requireAuth, ctrl.getNotification);
router.patch("/notifications/:id/read", requireAuth, ctrl.markRead);
router.delete("/notifications/:id", requireAuth, ctrl.deleteNotification);

router.get("/notifications/admin/stats", requireAdmin, ctrl.adminStats);
router.get("/notifications/admin/list", requireAdmin, ctrl.adminList);
router.post("/notifications/admin/send-offer", requireAdmin, ctrl.adminSendOffer);
router.post("/notifications/admin/send-coupon", requireAdmin, ctrl.adminSendCoupon);
router.post("/notifications/admin/bus-status", requireAdmin, ctrl.adminBusStatus);

module.exports = router;
