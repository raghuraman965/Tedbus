const jwt = require("jsonwebtoken");

const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET;
if (!ADMIN_JWT_SECRET) {
  throw new Error("ADMIN_JWT_SECRET is not set. Add it to server/.env (see server/.env.example).");
}

const Admin = require("../models/admin");
const { JWT_SECRET: CUSTOMER_JWT_SECRET } = require("./auth");
const { tReq } = require("../services/i18n");

function signAdminToken(admin) {
  return jwt.sign(
    {
      adminId: admin._id.toString(),
      username: admin.username,
      role: admin.role,
      type: "admin",
    },
    ADMIN_JWT_SECRET,
    { expiresIn: "12h" }
  );
}

async function requireAdminAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: tReq(req, "errors.admin.required") });
  }
  try {
    const payload = jwt.verify(token, ADMIN_JWT_SECRET);
    if (payload.type !== "admin") {
      return res.status(403).json({ error: tReq(req, "errors.admin.tokenExpected") });
    }
    const admin = await Admin.findById(payload.adminId).lean().exec();
    if (!admin || admin.isActive !== true) {
      return res.status(401).json({ error: tReq(req, "errors.admin.inactive") });
    }
    req.admin = admin;
    req.adminId = admin._id.toString();
    next();
  } catch (err) {
    // If the token verifies with the CUSTOMER secret, a customer session is
    // being misused on an admin route -> 403 Forbidden (never escalate).
    try {
      jwt.verify(token, CUSTOMER_JWT_SECRET);
      return res
        .status(403)
        .json({ error: tReq(req, "errors.admin.customerNotAllowed") });
    } catch (_) {
      return res.status(401).json({ error: tReq(req, "errors.admin.sessionExpired") });
    }
  }
}

module.exports = { signAdminToken, requireAdminAuth, ADMIN_JWT_SECRET };
