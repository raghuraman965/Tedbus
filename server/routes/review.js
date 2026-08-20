const express = require("express");
const router = express.Router();
const ctrl = require("../controller/review");
const { requireAuth } = require("../middleware/auth");

// Public
router.get("/api/reviews/:busId", ctrl.getReviews);

// Authenticated
router.post("/api/reviews", requireAuth, ctrl.createReview);
router.put("/api/reviews/:id", requireAuth, ctrl.updateReview);
router.delete("/api/reviews/:id", requireAuth, ctrl.deleteReview);
router.get("/api/reviews/user/me", requireAuth, ctrl.myReviews);

module.exports = router;
