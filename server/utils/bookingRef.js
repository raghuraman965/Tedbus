const crypto = require("crypto");

// Shared ticket-signing secret. QR payloads are signed with an HMAC so a
// tampered QR (edited PNR, seat numbers, passenger name, etc.) can be detected
// server-side when a driver scans it. Falls back to the JWT secret so a single
// secret still works, but a dedicated TICKET_SIGNING_SECRET is recommended.
const TICKET_SIGNING_SECRET =
  process.env.TICKET_SIGNING_SECRET || process.env.JWT_SECRET;
if (!TICKET_SIGNING_SECRET) {
  throw new Error("TICKET_SIGNING_SECRET (or JWT_SECRET) is not set. Add it to server/.env (see server/.env.example).");
}

// How long a verified payment may sit before being used to create a booking.
const PAYMENT_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

const randomDigits = (n) => {
  let out = "";
  const pool = crypto.randomBytes(n);
  for (let i = 0; i < n; i++) out += String(pool[i] % 10);
  return out;
};

/**
 * Generates a unique PNR in the form TED<YYMMDD><5 random digits>, e.g.
 * TED26080583917. The caller is responsible for guaranteeing uniqueness in the
 * database (and retrying on a collision).
 */
function generatePnr(now = new Date()) {
  const y = String(now.getFullYear()).slice(-2);
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `TED${y}${m}${d}${randomDigits(5)}`;
}

/** Random idempotency key sent by the client when starting a payment. */
function generatePaymentReference() {
  return `REF${Date.now()}${randomDigits(10)}`;
}

/** Simulated gateway transaction id (no real gateway exists in the project). */
function generateTransactionId() {
  return `TXN${Date.now()}${randomDigits(8)}`;
}

/**
 * Builds the tamper-evident payload stored in the ticket QR code.
 * `raw` is a plain JSON object of ticket facts; the returned string is
 * `base64url(json).<hex-hmac>` so the server can verify it unchanged.
 */
function signQrPayload(raw) {
  const json = Buffer.from(JSON.stringify(raw)).toString("base64url");
  const sig = crypto
    .createHmac("sha256", TICKET_SIGNING_SECRET)
    .update(json)
    .digest("hex");
  return `${json}.${sig}`;
}

/**
 * Verifies a QR payload string produced by signQrPayload.
 * Returns the decoded object when the signature matches, otherwise null.
 */
function verifyQrPayload(qrData) {
  if (typeof qrData !== "string") return null;
  const dot = qrData.lastIndexOf(".");
  if (dot <= 0) return null;
  const json = qrData.slice(0, dot);
  const sig = qrData.slice(dot + 1);
  const expected = crypto
    .createHmac("sha256", TICKET_SIGNING_SECRET)
    .update(json)
    .digest("hex");
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return null;
  }
  try {
    return JSON.parse(Buffer.from(json, "base64url").toString("utf8"));
  } catch (e) {
    return null;
  }
}

module.exports = {
  generatePnr,
  generatePaymentReference,
  generateTransactionId,
  signQrPayload,
  verifyQrPayload,
  PAYMENT_EXPIRY_MS,
  TICKET_SIGNING_SECRET,
};
