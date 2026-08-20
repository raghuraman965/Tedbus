const express = require("express");
const router = express.Router();
const { login, me } = require("../controller/adminAuth");
const { requireAdminAuth } = require("../middleware/adminAuth");

router.post("/admin/auth/login", login);
router.get("/admin/auth/me", requireAdminAuth, me);

module.exports = router;
