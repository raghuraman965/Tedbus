const express = require("express");
const router = express.Router();
const profile = require("../controller/profile");
const { requireAuth } = require("../middleware/auth");

// GET /profile - return the authenticated user's full profile
router.get("/profile", requireAuth, profile.getProfile);

// PUT /profile - update profile fields
router.put("/profile", requireAuth, profile.updateProfile);

// POST /profile/photo - upload a profile photo (multipart/form-data)
router.post("/profile/photo", requireAuth, profile.uploadPhoto);

// POST /profile/photo/save - persist the photo URL to the user document
router.post("/profile/photo/save", requireAuth, profile.savePhoto);

module.exports = router;
