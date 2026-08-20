const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const Customer = require("../models/customer");
const { signToken } = require("../middleware/auth");
const { tReq } = require("../services/i18n");
const notificationService = require("../services/notificationService");

let nodemailer = null;
try { nodemailer = require("nodemailer"); } catch (e) { nodemailer = null; }

let googleAuth = null;
try { googleAuth = require("google-auth-library"); } catch (e) { googleAuth = null; }

// In-memory OTP store for phone + email OTP flows.
// Keys are prefixed: phone OTPs use the raw phone number, email OTPs use
// "email:{email}", and phone-signup OTPs use "signup:{phone}".
const otpStore = new Map();

// ======================== HELPERS ========================

function sanitizeCustomer(customerDoc) {
  const customer = customerDoc.toObject ? customerDoc.toObject() : customerDoc;
  delete customer.password;
  return customer;
}

// Backward-compatible auth payload: the existing app stores this exact object
// in sessionStorage ("Loggedinuser"), so the JWT is added as an extra field
// and every existing consumer keeps working unchanged.
function toAuthResponse(customerDoc) {
  const customer = sanitizeCustomer(customerDoc);
  return { ...customer, token: signToken(customerDoc) };
}

/**
 * Returns a nodemailer transport if SMTP is configured, or null otherwise.
 * Does NOT import the heavy notificationService - uses nodemailer directly.
 */
function getEmailTransport() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !port || !user || !pass) return null;
  if (!nodemailer) return null;
  return nodemailer.createTransport({
    host,
    port,
    secure: Number(port) === 465,
    auth: { user, pass },
  });
}

function isValidEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

// ======================== EXISTING ENDPOINTS ========================

exports.signup = async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: tReq(req, "auth.requiredFields") });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: tReq(req, "auth.passwordTooShort") });
    }

    const existingEmail = await Customer.findOne({ email }).exec();
    if (existingEmail) {
      return res.status(409).json({ error: tReq(req, "auth.emailExists"), field: "email" });
    }

    if (phone) {
      const existingPhone = await Customer.findOne({ phone }).exec();
      if (existingPhone) {
        return res.status(409).json({ error: tReq(req, "auth.phoneExists"), field: "phone" });
      }
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const customer = new Customer({
      name,
      email,
      phone,
      password: passwordHash,
      authProvider: "email",
    });

    const savedCustomer = await customer.save();
    notificationService.notifyWelcome(savedCustomer).catch((e) =>
      console.error("welcome notification error:", e.message)
    );
    res.status(201).json(toAuthResponse(savedCustomer));
  } catch (error) {
    if (error && error.code === 11000) {
      const dupField = error.keyPattern ? Object.keys(error.keyPattern)[0] : null;
      if (dupField === "phone") {
        return res.status(409).json({ error: tReq(req, "auth.phoneExists"), field: "phone" });
      }
      return res.status(409).json({ error: tReq(req, "auth.emailExists"), field: "email" });
    }
    console.error("error signing up", error);
    res.status(500).json({ error: tReq(req, "errors.auth.internal") });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: tReq(req, "auth.loginRequired") });
    }

    const customer = await Customer.findOne({ email }).exec();
    if (!customer || !customer.password) {
      return res.status(401).json({ error: tReq(req, "auth.invalidCredentials") });
    }

    const isMatch = await bcrypt.compare(password, customer.password);
    if (!isMatch) {
      return res.status(401).json({ error: tReq(req, "auth.invalidCredentials") });
    }

    const ua = req.get("user-agent") || "";
    notificationService.notifyNewLogin(customer, { device: ua, location: "web" }).catch((e) =>
      console.error("login notification error:", e.message)
    );

    res.status(200).json(toAuthResponse(customer));
  } catch (error) {
    console.error("error logging in", error);
    res.status(500).json({ error: tReq(req, "errors.auth.internal") });
  }
};

// ======================== PHONE OTP (kept for backward compat) ========================

exports.sendOtp = async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      return res.status(400).json({ error: tReq(req, "auth.phoneRequired") });
    }

    // LOGIN flow: an OTP is only issued for an existing account.
    const existingCustomer = await Customer.findOne({ phone }).exec();
    if (!existingCustomer) {
      return res.status(404).json({
        success: false,
        message: tReq(req, "auth.noAccount"),
      });
    }

    const otp = crypto.randomInt(1000, 10000).toString();
    otpStore.set(phone, { otp, expiresAt: Date.now() + 5 * 60 * 1000 });

    // NOTE: no SMS provider is configured, so the OTP is logged for dev only.
    if (process.env.NODE_ENV !== "production") console.log(`[auth] OTP for ${phone}: ${otp}`);
    res.status(200).json({ message: tReq(req, "auth.otpDev") });
  } catch (error) {
    console.error("error sending otp", error);
    res.status(500).json({ error: tReq(req, "errors.auth.internal") });
  }
};

exports.verifyOtp = async (req, res) => {
  try {
    const { phone, otp } = req.body;
    if (!phone || !otp) {
      return res.status(400).json({ error: tReq(req, "auth.phoneOtpRequired") });
    }

    const record = otpStore.get(phone);
    if (!record || record.otp !== otp || record.expiresAt < Date.now()) {
      return res.status(401).json({ error: tReq(req, "auth.otpInvalid") });
    }
    otpStore.delete(phone);

    // LOGIN flow: verification only logs in an existing account.
    const customer = await Customer.findOne({ phone }).exec();
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: tReq(req, "auth.noAccount"),
      });
    }

    const ua = req.get("user-agent") || "";
    notificationService.notifyNewLogin(customer, { device: ua, location: "web" }).catch((e) =>
      console.error("login notification error:", e.message)
    );

    res.status(200).json(toAuthResponse(customer));
  } catch (error) {
    console.error("error verifying otp", error);
    res.status(500).json({ error: tReq(req, "errors.auth.internal") });
  }
};

exports.signupSendOtp = async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      return res.status(400).json({ error: tReq(req, "auth.phoneRequired") });
    }

    // SIGNUP flow: an OTP is only issued when the phone is NOT already registered.
    const existingCustomer = await Customer.findOne({ phone }).exec();
    if (existingCustomer) {
      return res.status(409).json({
        success: false,
        message: tReq(req, "auth.accountExists"),
      });
    }

    const otp = crypto.randomInt(1000, 10000).toString();
    otpStore.set(`signup:${phone}`, { otp, expiresAt: Date.now() + 5 * 60 * 1000 });

    // NOTE: no SMS provider is configured, so the OTP is logged for dev only.
    if (process.env.NODE_ENV !== "production") console.log(`[auth] Signup OTP for ${phone}: ${otp}`);
    res.status(200).json({ message: tReq(req, "auth.otpDev") });
  } catch (error) {
    console.error("error sending signup otp", error);
    res.status(500).json({ error: tReq(req, "errors.auth.internal") });
  }
};

exports.signupVerifyOtp = async (req, res) => {
  try {
    const { phone, otp, name } = req.body;
    if (!phone || !otp) {
      return res.status(400).json({ error: tReq(req, "auth.phoneOtpRequired") });
    }

    const record = otpStore.get(`signup:${phone}`);
    if (!record || record.otp !== otp || record.expiresAt < Date.now()) {
      return res.status(401).json({ error: tReq(req, "auth.otpInvalid") });
    }
    otpStore.delete(`signup:${phone}`);

    // SIGNUP flow: only create the customer document when the phone is not already registered.
    const existingCustomer = await Customer.findOne({ phone }).exec();
    if (existingCustomer) {
      return res.status(409).json({
        success: false,
        message: tReq(req, "auth.accountExists"),
      });
    }

    const customer = new Customer({
      name: name || tReq(req, "auth.travellerDefault", { phone: phone.slice(-4) }),
      email: `${phone}@phone.tedbus.local`,
      phone,
      authProvider: "phone",
    });
    const savedCustomer = await customer.save();
    notificationService.notifyWelcome(savedCustomer).catch((e) =>
      console.error("welcome notification error:", e.message)
    );

    res.status(201).json(toAuthResponse(savedCustomer));
  } catch (error) {
    if (error && error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: tReq(req, "auth.accountExists"),
      });
    }
    console.error("error verifying signup otp", error);
    res.status(500).json({ error: tReq(req, "errors.auth.internal") });
  }
};

// ======================== EMAIL OTP ========================

exports.sendEmailOtp = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ error: tReq(req, "auth.emailRequired") || "A valid email address is required." });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Enforce 60-second cooldown between OTP requests
    const existingRecord = otpStore.get(`email:${normalizedEmail}`);
    if (existingRecord && existingRecord.lastSentAt && (Date.now() - existingRecord.lastSentAt) < 60000) {
      return res.status(429).json({ error: tReq(req, "auth.otpCooldown") || "Please wait before requesting another code." });
    }

    // Generate a 6-digit cryptographically secure OTP
    const otp = crypto.randomInt(100000, 999999).toString();
    const otpHash = await bcrypt.hash(otp, 10);

    otpStore.set(`email:${normalizedEmail}`, {
      otpHash,
      expiresAt: Date.now() + 5 * 60 * 1000,
      attempts: 0,
      lastSentAt: Date.now(),
    });

    // Log OTP only in development
    if (process.env.NODE_ENV !== "production") {
      console.log(`[auth] Email OTP for ${normalizedEmail}: ${otp}`);
    }

    // Send OTP via nodemailer
    const transporter = getEmailTransport();
    if (!transporter) {
      return res.status(503).json({ error: tReq(req, "auth.emailNotConfigured") || "Email service not configured. Please try another login method." });
    }

    const fromAddress = process.env.SMTP_FROM || "TedBus <no-reply@tedbus.local>";
    const mailOptions = {
      from: fromAddress,
      to: normalizedEmail,
      subject: "Your TedBus Login Code",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px">
          <div style="background:#d84e55;padding:16px 20px;text-align:center;border-radius:8px 8px 0 0">
            <h1 style="color:#fff;margin:0;font-size:20px">TedBus</h1>
          </div>
          <div style="border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px">
            <p style="color:#374151;font-size:15px;margin:0 0 16px">Your login verification code is:</p>
            <div style="background:#f3f4f6;border-radius:8px;padding:16px;text-align:center;margin:0 0 16px">
              <span style="font-size:32px;font-weight:700;letter-spacing:6px;color:#1f2937">${otp}</span>
            </div>
            <p style="color:#6b7280;font-size:13px;margin:0 0 8px">This code expires in <strong>5 minutes</strong>.</p>
            <p style="color:#dc2626;font-size:13px;margin:0;font-weight:600">Do not share this code with anyone.</p>
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0">
            <p style="color:#9ca3af;font-size:11px;margin:0">If you did not request this code, you can safely ignore this email.</p>
          </div>
        </div>`,
    };

    try {
      await transporter.sendMail(mailOptions);
    } catch (smtpErr) {
      console.error("Email OTP send failed:", smtpErr.message);
      return res.status(503).json({ error: tReq(req, "auth.emailSendFailed") || "Failed to send OTP email. Please try again." });
    }

    res.status(200).json({ success: true, message: tReq(req, "auth.emailOtpSent") || "OTP sent to your email" });
  } catch (error) {
    console.error("error sending email otp", error);
    res.status(500).json({ error: tReq(req, "errors.auth.internal") });
  }
};

exports.verifyEmailOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ error: tReq(req, "auth.emailRequired") || "A valid email address is required." });
    }
    if (!otp || !/^\d{6}$/.test(String(otp))) {
      return res.status(400).json({ error: tReq(req, "auth.otpRequired") || "A valid 6-digit OTP is required." });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const record = otpStore.get(`email:${normalizedEmail}`);

    if (!record || record.expiresAt < Date.now()) {
      if (record) otpStore.delete(`email:${normalizedEmail}`);
      return res.status(401).json({ error: tReq(req, "auth.otpExpired") || "OTP expired. Please request a new code." });
    }

    if (record.attempts >= 5) {
      otpStore.delete(`email:${normalizedEmail}`);
      return res.status(429).json({ error: tReq(req, "auth.otpTooManyAttempts") || "Too many attempts. Please request a new code." });
    }

    record.attempts += 1;

    const isMatch = await bcrypt.compare(String(otp), record.otpHash);
    if (!isMatch) {
      return res.status(401).json({ error: tReq(req, "auth.otpInvalid") || "Invalid OTP. Please try again." });
    }

    // OTP verified successfully - remove from store
    otpStore.delete(`email:${normalizedEmail}`);

    // Find or create customer by email
    let customer = await Customer.findOne({ email: normalizedEmail }).exec();

    if (!customer) {
      // Create new customer from email OTP login
      const namePrefix = normalizedEmail.split("@")[0];
      const defaultName = namePrefix
        .replace(/[._-]/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());

      customer = new Customer({
        name: defaultName,
        email: normalizedEmail,
        authProvider: "email",
        isVerified: false,
        profileCompleted: false,
      });
      const savedCustomer = await customer.save();
      notificationService.notifyWelcome(savedCustomer).catch((e) =>
        console.error("welcome notification error:", e.message)
      );
      res.status(201).json(toAuthResponse(savedCustomer));
    } else {
      // Existing customer - link email auth provider if not set or was phone-only
      if (!customer.authProvider || customer.authProvider === "phone") {
        customer.authProvider = "email";
      }
      await customer.save();

      const ua = req.get("user-agent") || "";
      notificationService.notifyNewLogin(customer, { device: ua, location: "web" }).catch((e) =>
        console.error("login notification error:", e.message)
      );

      res.status(200).json(toAuthResponse(customer));
    }
  } catch (error) {
    console.error("error verifying email otp", error);
    res.status(500).json({ error: tReq(req, "errors.auth.internal") });
  }
};

// ======================== GOOGLE LOGIN ========================

exports.googleLogin = async (req, res) => {
  try {
    const { credential } = req.body;

    if (!credential) {
      return res.status(400).json({ error: tReq(req, "auth.googleCredentialRequired") || "Google credential is required." });
    }

    if (!googleAuth) {
      return res.status(503).json({ error: "Google authentication library is not installed." });
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      return res.status(503).json({ error: "Google login is not configured." });
    }

    let ticket;
    try {
      const client = new googleAuth.OAuth2Client(clientId);
      ticket = await client.verifyIdToken({ idToken: credential, audience: clientId });
    } catch (verifyErr) {
      return res.status(401).json({ error: tReq(req, "auth.googleInvalid") || "Invalid Google credential." });
    }

    const payload = ticket.getPayload();
    if (!payload) {
      return res.status(401).json({ error: tReq(req, "auth.googleInvalid") || "Invalid Google credential." });
    }

    const { sub: googleId, email, name, picture } = payload;
    if (!email) {
      return res.status(401).json({ error: "Google account has no email." });
    }

    const normalizedEmail = email.toLowerCase();

    // 1) Find by email first (most reliable - links accounts)
    let customer = await Customer.findOne({ email: normalizedEmail }).exec();

    if (customer) {
      // Existing account found by email - link Google ID if not already linked
      if (!customer.googleId) {
        customer.googleId = googleId;
      }
      if (picture && !customer.profilePicture) {
        customer.profilePicture = picture;
      }
      await customer.save();
    } else {
      // 2) Find by googleId
      customer = await Customer.findOne({ googleId }).exec();

      if (!customer) {
        // 3) Create new customer
        const defaultName = name || normalizedEmail.split("@")[0]
          .replace(/[._-]/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase());

        customer = new Customer({
          name: defaultName,
          email: normalizedEmail,
          googleId,
          profilePicture: picture || "",
          authProvider: "google",
          isVerified: false,
          profileCompleted: false,
        });
        const savedCustomer = await customer.save();
        notificationService.notifyWelcome(savedCustomer).catch((e) =>
          console.error("welcome notification error:", e.message)
        );
        res.status(201).json(toAuthResponse(savedCustomer));
        return;
      }
    }

    const ua = req.get("user-agent") || "";
    notificationService.notifyNewLogin(customer, { device: ua, location: "web" }).catch((e) =>
      console.error("login notification error:", e.message)
    );

    res.status(200).json(toAuthResponse(customer));
  } catch (error) {
    console.error("error with google login", error);
    res.status(500).json({ error: tReq(req, "errors.auth.internal") });
  }
};