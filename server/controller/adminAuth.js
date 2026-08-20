const bcrypt = require("bcryptjs");
const Admin = require("../models/admin");
const { signAdminToken } = require("../middleware/adminAuth");
const { tReq } = require("../services/i18n");

exports.login = async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res
        .status(400)
        .json({ error: tReq(req, "adminAuth.usernameRequired") });
    }
    const admin = await Admin.findOne({
      username: String(username).trim().toLowerCase(),
    }).exec();
    if (!admin) {
      return res.status(401).json({ error: tReq(req, "adminAuth.invalidCredentials") });
    }
    if (admin.isActive !== true) {
      return res.status(403).json({ error: tReq(req, "adminAuth.disabled") });
    }
    const ok = await bcrypt.compare(password, admin.password);
    if (!ok) {
      return res.status(401).json({ error: tReq(req, "adminAuth.invalidCredentials") });
    }
    admin.lastLoginAt = new Date();
    await admin.save();
    const token = signAdminToken(admin);
    res.json({ token, admin: admin.toSafeJSON() });
  } catch (err) {
    res.status(500).json({ error: tReq(req, "adminAuth.errLogin") });
  }
};

exports.me = async (req, res) => {
  const admin = req.admin || {};
  res.json({
    admin: {
      _id: req.adminId,
      username: admin.username,
      name: admin.name || "",
      role: admin.role,
      isActive: admin.isActive,
    },
  });
};
