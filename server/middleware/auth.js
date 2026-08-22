const jwt = require("jsonwebtoken");
const Customer = require("../models/customer");
const { tReq } = require("../services/i18n");

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is not set. Add it to server/.env (see server/.env.example).");
}

function signToken(customer) {
  return jwt.sign(
    { id: customer._id.toString(), email: customer.email },
    JWT_SECRET,
    { expiresIn: "30d" }
  );
}

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: tReq(req, "errors.auth.required") });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const customer = await Customer.findById(payload.id).lean().exec();
    if (!customer) {
      return res.status(401).json({ error: tReq(req, "errors.auth.invalid") });
    }
    if (customer.isSuspended) {
      return res.status(403).json({ error: tReq(req, "errors.auth.suspended") });
    }
    req.user = customer;
    req.userId = customer._id.toString();
    next();
  } catch (err) {
    return res.status(401).json({ error: tReq(req, "errors.auth.sessionExpired") });
  }
}

// Same as requireAuth but anonymous requests continue without a user.
// Used on public listing endpoints that personalize the response when a
// valid Bearer token happens to be present (e.g. review viewer context).
async function optionalAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return next();
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const customer = await Customer.findById(payload.id).lean().exec();
    if (customer && !customer.isSuspended) {
      req.user = customer;
      req.userId = customer._id.toString();
    }
  } catch (err) {
    // Invalid/expired token on a public endpoint: stay anonymous.
  }
  next();
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (!req.user || req.user.isAdmin !== true) {
      return res.status(403).json({ error: tReq(req, "errors.auth.adminRequired") });
    }
    next();
  });
}

module.exports = { signToken, requireAuth, optionalAuth, requireAdmin, JWT_SECRET };
