const fs = require("fs");
const path = require("path");
const PaymentSettings = require("../models/paymentSettings");

const uploadsDir = path.join(__dirname, "..", "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

function extractBase64(dataUrl) {
  const match = /^data:(image\/(?:png|jpe?g|gif|webp));base64,(.+)$/.exec(dataUrl || "");
  if (!match) return null;
  const ext = match[1].split("/")[1].replace("jpeg", "jpg");
  return { ext, buffer: Buffer.from(match[2], "base64") };
}

async function getPaymentSettings(req, res) {
  try {
    let settings = await PaymentSettings.findOne();
    if (!settings) {
      settings = await PaymentSettings.create({});
    }
    res.status(200).json(settings);
  } catch (err) {
    res.status(500).json({ message: "Could not load payment settings." });
  }
}

async function updatePaymentSettings(req, res) {
  try {
    let settings = await PaymentSettings.findOne();
    const body = req.body || {};
    if (!settings) {
      settings = await PaymentSettings.create({});
    }

    if (body.merchantName !== undefined) settings.merchantName = body.merchantName;
    if (body.upiId !== undefined) settings.upiId = body.upiId;
    if (body.accountName !== undefined) settings.accountName = body.accountName;
    if (body.isActive !== undefined) settings.isActive = Boolean(body.isActive);

    if (typeof body.qrImage === "string" && body.qrImage.startsWith("data:")) {
      const parsed = extractBase64(body.qrImage);
      if (parsed) {
        const filename = `qr-${Date.now()}.${parsed.ext}`;
        fs.writeFileSync(path.join(uploadsDir, filename), parsed.buffer);

        if (settings.qrImage && settings.qrImage.startsWith("/uploads/")) {
          const oldPath = path.join(__dirname, "..", settings.qrImage.replace(/^\//, ""));
          if (fs.existsSync(oldPath)) {
            try {
              fs.unlinkSync(oldPath);
            } catch (err) {
              console.error("Could not remove old QR image:", err.message);
            }
          }
        }

        settings.qrImage = `/uploads/${filename}`;
      }
    } else if (typeof body.qrImage === "string") {
      settings.qrImage = body.qrImage;
    }

    await settings.save();
    res.status(200).json(settings);
  } catch (err) {
    res.status(500).json({ message: "Could not update payment settings." });
  }
}

module.exports = { getPaymentSettings, updatePaymentSettings };
