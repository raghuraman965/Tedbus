const express = require("express");
const router = express.Router();
const ctrl = require("../controller/review");
const { requireAuth, optionalAuth } = require("../middleware/auth");

// ---------------------------------------------------------------------------
// Reviews API
// Public:   GET route/bus listings + stats (viewer context when logged in)
// Auth:     create / edit(24h) / delete own, eligibility check, report, helpful
// ---------------------------------------------------------------------------

// Public — route-scoped reviews + stats (primary Task 6 surface)
router.get("/api/reviews/route/:routeId", optionalAuth, ctrl.getRouteReviews);

// Public — bus-scoped reviews + stats (backward compatible)
router.get("/api/reviews/bus/:busId", optionalAuth, ctrl.getBusReviews);

// Authenticated — static paths MUST be registered before "/:busId"
router.get("/api/reviews/user/me", requireAuth, ctrl.myReviews);
router.get("/api/reviews/eligibility", requireAuth, ctrl.checkEligibility);

// Authenticated — mutations
router.post("/api/reviews", requireAuth, ctrl.createReview);
router.put("/api/reviews/:id", requireAuth, ctrl.updateReview);
router.delete("/api/reviews/:id", requireAuth, ctrl.deleteReview);
router.post("/api/reviews/:id/report", requireAuth, ctrl.reportReview);
router.post("/api/reviews/:id/helpful", requireAuth, ctrl.toggleHelpful);

// Legacy public path kept last so it never shadows the routes above.
router.get("/api/reviews/:busId", optionalAuth, ctrl.getBusReviews);

module.exports = router;
