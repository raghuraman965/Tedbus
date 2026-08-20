// VAPID key management for Web Push (Push API).
//
// web-push needs a stable public/private VAPID key pair: subscriptions are
// bound to the public key, so regenerating it on every restart would orphan
// every saved browser subscription. Priority order:
//   1. Explicit VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY env vars.
//   2. Keys persisted in <server>/.vapid-keys.json (generated on first boot).
//   3. Freshly generated keys (persisted to the file above).
//
// The public key is served to the browser via GET /notifications/push-public-key
// so the frontend can build a PushManager subscription without bundling keys.

const fs = require("fs");
const path = require("path");
const webPush = require("web-push");

const KEY_FILE = path.join(__dirname, "..", ".vapid-keys.json");

let cache = null;

function ensureKeys() {
  if (cache) return cache;

  const envPublic = process.env.VAPID_PUBLIC_KEY;
  const envPrivate = process.env.VAPID_PRIVATE_KEY;
  if (envPublic && envPrivate) {
    cache = { publicKey: envPublic, privateKey: envPrivate };
    return cache;
  }

  try {
    if (fs.existsSync(KEY_FILE)) {
      const raw = JSON.parse(fs.readFileSync(KEY_FILE, "utf8"));
      if (raw.publicKey && raw.privateKey) {
        cache = { publicKey: raw.publicKey, privateKey: raw.privateKey };
        return cache;
      }
    }
  } catch (err) {
    // Corrupt/partial file — regenerate below.
  }

  const keys = webPush.generateVAPIDKeys();
  cache = { publicKey: keys.publicKey, privateKey: keys.privateKey };
  try {
    fs.writeFileSync(KEY_FILE, JSON.stringify(cache, null, 2), "utf8");
    console.log("[vapid] Generated a new VAPID key pair and saved it to .vapid-keys.json");
  } catch (err) {
    // Cannot persist (e.g. read-only FS). In-memory keys still work for this
    // process lifetime, but subscriptions will break after a restart.
  }
  return cache;
}

function getVapidPublicKey() {
  return ensureKeys().publicKey;
}

module.exports = { getVapidKeys: ensureKeys, getVapidPublicKey };
