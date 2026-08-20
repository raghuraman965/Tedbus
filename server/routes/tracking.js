const express = require("express");
const router = express.Router();
const ctrl = require("../controller/tracking");
const { requireAuth } = require("../middleware/auth");

router.get("/api/tracking/my-bookings", requireAuth, ctrl.myBookings);
router.get("/api/tracking/:busId/:date", ctrl.getTracking);
router.get("/api/tracking/:busId/:date/stops", ctrl.getStopTimeline);

module.exports = router;
