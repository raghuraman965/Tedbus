const express = require("express");
const router = express.Router();
const ctrl = require("../controller/verification");
const { requireAuth } = require("../middleware/auth");
const { requireAdminAuth } = require("../middleware/adminAuth");

// User endpoints
router.post("/verification/request", requireAuth, ctrl.submitRequest);
router.get("/verification/status", requireAuth, ctrl.getRequestStatus);

// Admin endpoints
router.get("/admin/verification-requests", requireAdminAuth, ctrl.adminListRequests);
router.put("/admin/verification-requests/:id", requireAdminAuth, ctrl.adminReviewRequest);

module.exports = router;
