const express = require("express");
const router = express.Router();
const Customer = require("../models/customer");
const { requireAuth } = require("../middleware/auth");

// Keep this in sync with the frontend SUPPORTED_LANGUAGES list.
const SUPPORTED_LANGUAGES = ["en", "ta", "hi", "te", "kn", "ml"];

// GET /user/preference - return the logged-in user's saved language preference.
router.get("/user/preference", requireAuth, async (req, res) => {
  try {
    res.status(200).json({ preferredLanguage: req.user.preferredLanguage || "en" });
  } catch (error) {
    console.error("error reading language preference", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

// PUT /user/preference - persist the user's language preference in MongoDB.
router.put("/user/preference", requireAuth, async (req, res) => {
  try {
    const raw = req.body && req.body.preferredLanguage;
    const preferredLanguage = String(raw || "en").toLowerCase();
    if (!SUPPORTED_LANGUAGES.includes(preferredLanguage)) {
      return res.status(400).json({ error: "Unsupported language." });
    }
    await Customer.updateOne(
      { _id: req.userId },
      { $set: { preferredLanguage } }
    );
    res.status(200).json({ preferredLanguage });
  } catch (error) {
    console.error("error saving language preference", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

module.exports = router;
