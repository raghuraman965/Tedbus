const fs = require("fs");
const path = require("path");
const multer = require("multer");
const Customer = require("../models/customer");
const { signToken } = require("../middleware/auth");
const { tReq } = require("../services/i18n");

// ===================== PROFILE PHOTO UPLOAD =====================

const profileUploadsDir = path.join(__dirname, "..", "uploads", "profiles");
if (!fs.existsSync(profileUploadsDir)) {
  fs.mkdirSync(profileUploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, profileUploadsDir),
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || ".jpg").toLowerCase();
    cb(null, `profile-${req.userId}-${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(png|jpe?g|gif|webp)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error("Only image files (PNG/JPG/GIF/WEBP) are allowed."));
  },
});

// ===================== HELPERS =====================

const ALLOWED_UPDATES = [
  "name",
  "gender",
  "dateOfBirth",
  "age",
  "phone",
  "alternatePhone",
  "bio",
  "location",
  "preferredLanguage",
  "themePreference",
  "address",
  "emergencyContact",
  "travelPreferences",
  "profileCompleted",
];

const IMMUTABLE_FIELDS = ["_id", "email", "password", "isAdmin", "authProvider", "googleId", "isVerified", "isSuspended", "createdAt"];

function sanitizeCustomer(doc) {
  const obj = doc.toObject ? doc.toObject() : doc;
  delete obj.password;
  delete obj.__v;
  return obj;
}

function sanitizeOutput(doc) {
  const customer = sanitizeCustomer(doc);
  return { ...customer, token: signToken(doc) };
}

function isValidPhone(p) {
  return !p || /^\+?[\d\s\-()]{7,15}$/.test(p);
}

function isValidPincode(p) {
  return !p || /^\d{4,10}$/.test(p);
}

function sanitizeString(v) {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, 500);
}

function sanitizeNestedObject(obj, allowedKeys) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return {};
  const out = {};
  for (const key of allowedKeys) {
    if (obj[key] !== undefined && obj[key] !== null) {
      const val = obj[key];
      if (typeof val === "string") {
        out[key] = sanitizeString(val);
      } else if (typeof val === "boolean") {
        out[key] = val;
      }
    }
  }
  return out;
}

// ===================== CONTROLLERS =====================

exports.getProfile = async (req, res) => {
  try {
    const customer = await Customer.findById(req.userId).exec();
    if (!customer) {
      return res.status(404).json({ error: tReq(req, "profile.notFound") });
    }
    res.status(200).json(sanitizeOutput(customer));
  } catch (error) {
    console.error("error fetching profile", error);
    res.status(500).json({ error: tReq(req, "errors.auth.internal") });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const updates = {};
    const errors = [];

    // Simple scalar fields
    if (req.body.name !== undefined) {
      const name = sanitizeString(req.body.name);
      if (!name) {
        errors.push(tReq(req, "profile.nameRequired"));
      } else if (name.length < 2) {
        errors.push(tReq(req, "profile.nameTooShort"));
      } else {
        updates.name = name;
      }
    }

    if (req.body.gender !== undefined) {
      const gender = sanitizeString(req.body.gender);
      const allowed = ["", "male", "female", "other", "prefer_not_to_say"];
      if (gender && !allowed.includes(gender.toLowerCase())) {
        errors.push(tReq(req, "profile.genderInvalid"));
      } else {
        updates.gender = gender.toLowerCase();
      }
    }

    if (req.body.dateOfBirth !== undefined) {
      updates.dateOfBirth = sanitizeString(req.body.dateOfBirth);
    }

    if (req.body.age !== undefined) {
      const age = parseInt(req.body.age, 10);
      if (req.body.age !== "" && (isNaN(age) || age < 1 || age > 150)) {
        errors.push(tReq(req, "profile.ageInvalid"));
      } else {
        updates.age = req.body.age === "" ? undefined : age;
      }
    }

    if (req.body.phone !== undefined) {
      const phone = sanitizeString(req.body.phone);
      if (phone && !isValidPhone(phone)) {
        errors.push(tReq(req, "profile.phoneInvalid"));
      } else if (phone) {
        const existing = await Customer.findOne({ phone, _id: { $ne: req.userId } }).exec();
        if (existing) {
          errors.push(tReq(req, "profile.phoneTaken"));
        } else {
          updates.phone = phone;
        }
      } else {
        updates.phone = "";
      }
    }

    if (req.body.alternatePhone !== undefined) {
      const alt = sanitizeString(req.body.alternatePhone);
      if (alt && !isValidPhone(alt)) {
        errors.push(tReq(req, "profile.phoneInvalid"));
      } else {
        updates.alternatePhone = alt;
      }
    }

    if (req.body.bio !== undefined) {
      updates.bio = sanitizeString(req.body.bio).slice(0, 500);
    }

    if (req.body.location !== undefined) {
      updates.location = sanitizeString(req.body.location).slice(0, 200);
    }

    if (req.body.preferredLanguage !== undefined) {
      const SUPPORTED = ["en", "hi", "ta", "te", "kn", "ml"];
      const lang = sanitizeString(req.body.preferredLanguage).toLowerCase() || "en";
      updates.preferredLanguage = SUPPORTED.includes(lang) ? lang : "en";
    }

    if (req.body.themePreference !== undefined) {
      const THEMES = ["light", "dark", "system"];
      const theme = sanitizeString(req.body.themePreference).toLowerCase() || "system";
      updates.themePreference = THEMES.includes(theme) ? theme : "system";
    }

    // Nested: address
    if (req.body.address !== undefined) {
      const addr = sanitizeNestedObject(req.body.address, ["street", "city", "state", "pincode", "country"]);
      if (addr.pincode && !isValidPincode(addr.pincode)) {
        errors.push(tReq(req, "profile.pincodeInvalid"));
      }
      updates.address = addr;
    }

    // Nested: emergencyContact
    if (req.body.emergencyContact !== undefined) {
      const ec = sanitizeNestedObject(req.body.emergencyContact, ["name", "phone", "relation"]);
      if (ec.phone && !isValidPhone(ec.phone)) {
        errors.push(tReq(req, "profile.phoneInvalid"));
      }
      updates.emergencyContact = ec;
    }

    // Nested: travelPreferences
    if (req.body.travelPreferences !== undefined) {
      updates.travelPreferences = sanitizeNestedObject(
        req.body.travelPreferences,
        ["seatType", "busType", "language", "notifications"]
      );
    }

    if (errors.length > 0) {
      return res.status(400).json({ error: errors.join(" "), errors });
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: tReq(req, "profile.noFields") });
    }

    const customer = await Customer.findByIdAndUpdate(
      req.userId,
      { $set: updates },
      { new: true, runValidators: true }
    ).exec();

    if (!customer) {
      return res.status(404).json({ error: tReq(req, "profile.notFound") });
    }

    res.status(200).json(sanitizeOutput(customer));
  } catch (error) {
    if (error && error.code === 11000) {
      return res.status(409).json({ error: tReq(req, "profile.duplicateField") });
    }
    console.error("error updating profile", error);
    res.status(500).json({ error: tReq(req, "errors.auth.internal") });
  }
};

exports.uploadPhoto = (req, res) => {
  upload.single("profilePhoto")(req, res, (err) => {
    if (err) {
      const msg = err.message || tReq(req, "profile.photoUploadFailed");
      return res.status(400).json({ error: msg });
    }
    if (!req.file) {
      return res.status(400).json({ error: tReq(req, "profile.noPhoto") });
    }
    const photoUrl = "/uploads/profiles/" + req.file.filename;
    res.status(200).json({ profilePicture: photoUrl });
  });
};

exports.savePhoto = async (req, res) => {
  try {
    const { profilePicture } = req.body;
    if (!profilePicture || typeof profilePicture !== "string") {
      return res.status(400).json({ error: tReq(req, "profile.noPhoto") });
    }

    const clean = profilePicture.trim();
    if (!clean.startsWith("/uploads/profiles/")) {
      return res.status(400).json({ error: tReq(req, "profile.photoInvalid") });
    }

    const customer = await Customer.findById(req.userId).exec();
    if (!customer) {
      return res.status(404).json({ error: tReq(req, "profile.notFound") });
    }

    // Remove old profile photo if it existed
    if (customer.profilePicture && customer.profilePicture !== clean) {
      const oldPath = path.join(__dirname, "..", customer.profilePicture);
      if (fs.existsSync(oldPath)) {
        try { fs.unlinkSync(oldPath); } catch (e) { /* ignore */ }
      }
    }

    customer.profilePicture = clean;
    await customer.save();

    res.status(200).json(sanitizeOutput(customer));
  } catch (error) {
    console.error("error saving photo", error);
    res.status(500).json({ error: tReq(req, "errors.auth.internal") });
  }
};
