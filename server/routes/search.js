const express = require("express");
const router = express.Router();
const searchController = require("../controller/search");

// Bus search with intermediate stops + time awareness
router.get("/search/:from/:to/:date", searchController.searchBuses);

// Route detail with all stops
router.get("/search/route/:routeId", searchController.getRouteDetail);

// Boarding/dropping points for a segment
router.get(
  "/search/points/:routeId/:fromStopSeq/:toStopSeq",
  searchController.getBoardingDroppingPoints
);

// Segment-specific seat availability
router.post("/search/segment-seats", searchController.getSegmentSeats);

module.exports = router;
