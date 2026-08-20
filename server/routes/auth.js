const express = require("express");
const router = express.Router();
const rateLimit = require("express-rate-limit");
const authcontroller = require("../controller/auth");

// Strict rate limit on login (brute-force protection)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many login attempts, please try again later." },
});

// OTP rate limit (prevent OTP flooding/brute-force)
const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  message: { error: "Too many OTP requests, please try again later." },
});

// Email OTP rate limit (prevent email flooding)
const emailOtpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  message: { error: "Too many email OTP requests, please try again later." },
});

// Signup rate limit
const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: "Too many signup attempts, please try again later." },
});

// Google login rate limit (prevent abuse)
const googleLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: { error: "Too many login attempts, please try again later." },
});

// Existing routes
router.post("/auth/signup", signupLimiter, authcontroller.signup);
router.post("/auth/login", loginLimiter, authcontroller.login);
router.post("/auth/send-otp", otpLimiter, authcontroller.sendOtp);
router.post("/auth/verify-otp", otpLimiter, authcontroller.verifyOtp);
router.post("/auth/signup-send-otp", otpLimiter, authcontroller.signupSendOtp);
router.post("/auth/signup-verify-otp", otpLimiter, authcontroller.signupVerifyOtp);

// Email OTP routes
router.post("/auth/send-email-otp", emailOtpLimiter, authcontroller.sendEmailOtp);
router.post("/auth/verify-email-otp", emailOtpLimiter, authcontroller.verifyEmailOtp);

// Google OAuth login
router.post("/auth/google-login", googleLoginLimiter, authcontroller.googleLogin);

module.exports = router;