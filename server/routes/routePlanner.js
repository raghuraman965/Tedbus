const express = require("express");
const router = express.Router();
const controller = require("../controller/routePlanner");
const { requireAuth } = require("../middleware/auth");

// Public map utilities (geocoding + routing) proxied to free providers.
router.get("/api/maps/search", controller.searchPlaces);
router.post("/api/maps/route", controller.calculateRoute);

// Authenticated saved-route CRUD.
router.get("/api/saved-routes", requireAuth, controller.listSavedRoutes);
router.post("/api/saved-routes", requireAuth, controller.createSavedRoute);
router.put("/api/saved-routes/:id", requireAuth, controller.updateSavedRoute);
router.delete("/api/saved-routes/:id", requireAuth, controller.deleteSavedRoute);

module.exports = router;
