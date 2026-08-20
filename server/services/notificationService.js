const Notification = require("../models/notification");
const NotificationPreference = require("../models/notificationPreference");
const PushSubscription = require("../models/pushSubscription");
const Customer = require("../models/customer");
const Booking = require("../models/booking");

let nodemailer = null;
try { nodemailer = require("nodemailer"); } catch (e) { nodemailer = null; }

let webPush = null;
try {
  webPush = require("web-push");
  const { getVapidKeys } = require("../utils/vapid");
  const keys = getVapidKeys();
  webPush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:no-reply@tedbus.local",
    keys.publicKey,
    keys.privateKey
  );
  console.log("[push] VAPID configured — web push ENABLED.");
} catch (e) {
  webPush = null;
  console.error("[push] web-push initialization FAILED:", e.message);
}

const EMAIL_CONFIG = {
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  user: process.env.SMTP_USER,
  pass: process.env.SMTP_PASS,
  from: process.env.SMTP_FROM || "TedBus <no-reply@tedbus.local>",
};

const CATEGORY_LABEL = {
  booking: "Booking", payment: "Payment", journey: "Journey",
  trip_update: "Trip Update", bus: "Bus Alerts", cancellation: "Cancellation",
  refund: "Refund", offers: "Offers", promotions: "Promotions",
  community: "Community", support: "Support", account: "Account",
  security: "Security", system: "System",
};

const LOCALES = ["en", "hi", "ta", "te", "kn", "ml"];

function fmtTime(h) {
  if (h === undefined || h === null || h === "") return "";
  let totalMinutes;
  if (typeof h === "string") {
    const m = h.trim().match(/^(\d{1,2}):(\d{1,2})$/);
    totalMinutes = m ? Number(m[1]) * 60 + Number(m[2]) : Math.round(Number(h) * 60);
  } else {
    totalMinutes = Math.round(Number(h) * 60);
  }
  if (!Number.isFinite(totalMinutes) || totalMinutes < 0) return "";
  const hh = Math.floor((totalMinutes / 60) % 24);
  const mm = totalMinutes % 60;
  const period = hh >= 12 ? "PM" : "AM";
  const displayH = hh % 12 === 0 ? 12 : hh % 12;
  return `${displayH}:${String(mm).padStart(2, "0")} ${period}`;
}

function parseDeparture(dd) {
  if (!dd || !dd.date) return null;
  let totalMinutes;
  if (typeof dd.time === "string") {
    const m = dd.time.trim().match(/^(\d{1,2}):(\d{1,2})$/);
    totalMinutes = m ? Number(m[1]) * 60 + Number(m[2]) : Math.round(Number(dd.time) * 60);
  } else {
    const t = Number(dd.time);
    totalMinutes = Number.isFinite(t) ? Math.round(t * 60) : 0;
  }
  if (!Number.isFinite(totalMinutes) || totalMinutes < 0) totalMinutes = 0;
  const h = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const dateStr = String(dd.date);
  const dm = dateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!dm) {
    const d2 = new Date(dateStr);
    if (Number.isNaN(d2.getTime())) return null;
    d2.setHours(h, minutes, 0, 0);
    return d2;
  }
  return new Date(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3]), h, minutes, 0, 0);
}

function newDepartureTime(dd, delayMinutes) {
  const d = parseDeparture(dd);
  if (!d) return "";
  d.setMinutes(d.getMinutes() + (delayMinutes || 0));
  return fmtTime(d.getHours() + d.getMinutes() / 60);
}

// ======================== ENGLISH TRANSLATOR ========================

function tEn(type, p) {
  const R = p.route || "", D = p.date || "", T = p.time || "", BID = p.bookingId || "";
  switch (type) {
    // Booking
    case "booking_confirmed":
      return { title: "Booking Confirmed!", message: `Your journey ${R} on ${D} at ${T} is confirmed. Ticket ID: ${BID}.` };
    case "booking_cancelled":
      return { title: "Booking Cancelled", message: `Your booking ${R} on ${D} at ${T} (Ticket: ${BID}) has been cancelled.` };
    // Payment
    case "payment_successful":
      return { title: "Payment Successful", message: `Payment of ₹${p.amount || ""} for booking ${BID} (${R}) received successfully.` };
    case "payment_failed":
      return { title: "Payment Failed", message: `Payment of ₹${p.amount || ""} for booking ${BID} (${R}) failed. ${p.reason || "Please try again."}` };
    case "payment_pending":
      return { title: "Payment Pending", message: `Payment of ₹${p.amount || ""} for booking ${BID} (${R}) is pending. ${p.reason || "We'll update you shortly."}` };
    // Journey / Trip reminders
    case "journey_reminder":
    case "trip_reminder_24h":
      return { title: "Trip Reminder (24 hours)", message: `Your bus ${R} departs on ${D} at ${T}. Plan your journey to the boarding point.` };
    case "trip_reminder_6h":
      return { title: "Trip Reminder (6 hours)", message: `Your bus ${R} departs on ${D} at ${T}. Please start getting ready.` };
    case "trip_reminder_2h":
      return { title: "Trip Reminder (2 hours)", message: `Your bus ${R} departs on ${D} at ${T}. Head to the boarding point now.` };
    case "trip_reminder_1h":
      return { title: "Trip Reminder (1 hour)", message: `Your bus ${R} departs on ${D} at ${T}. Be at the boarding point!` };
    case "trip_reminder_30m":
      return { title: "Trip Reminder (30 min)", message: `Your bus ${R} departs on ${D} at ${T}. Board now!` };
    case "boarding_reminder":
      return { title: "Boarding Reminder", message: `Your bus ${R} on ${D} is boarding. Please be at the gate.` };
    case "journey_completed":
      return { title: "Journey Completed", message: `Your journey ${R} on ${D} is complete. Thank you for traveling with TedBus!` };
    // Bus updates
    case "bus_delayed":
      return { title: "Bus Delayed", message: `${p.busName || "Your bus"} (${R}, ${D}) is delayed by ${p.delayMinutes || 0} min. New time: ${p.newTime || T}.` };
    case "bus_rescheduled":
      return { title: "Bus Rescheduled", message: `${p.busName || "Your bus"} (${R}, ${D}) rescheduled. New time: ${p.newTime || T}.` };
    case "bus_cancelled":
      return { title: "Bus Cancelled", message: `${p.busName || "Your bus"} (${R}, ${D}) has been cancelled. Please contact support.` };
    case "boarding_point_changed":
      return { title: "Boarding Point Changed", message: `Boarding point for ${R} on ${D} changed to: ${p.newBoardingPoint || "new location"}.` };
    case "timing_changed":
      return { title: "Timing Changed", message: `Departure time for ${R} on ${D} changed from ${T} to ${p.newTime || "new time"}.` };
    case "route_changed":
      return { title: "Route Changed", message: `Route for ${R} on ${D} has been modified. Check updated itinerary.` };
    // Cancellation
    case "ticket_cancelled":
      return { title: "Ticket Cancelled", message: `Your ticket ${BID} for ${R} on ${D} has been cancelled.` };
    // Refund
    case "refund_initiated":
      return { title: "Refund Initiated", message: `Refund of ₹${p.amount || ""} for ticket ${BID} has been initiated. It may take 5-7 business days.` };
    case "refund_processing":
      return { title: "Refund Processing", message: `Your refund of ₹${p.amount || ""} for ticket ${BID} is being processed.` };
    case "refund_successful":
      return { title: "Refund Successful", message: `Refund of ₹${p.amount || ""} for ticket ${BID} has been credited to your account.` };
    case "refund_failed":
      return { title: "Refund Failed", message: `Refund for ticket ${BID} could not be processed. ${p.reason || "Please contact support."}` };
    // Offers
    case "offer":
      return { title: "Special Offer for You", message: `${p.offerTitle || "Exclusive deal"}. Use code ${p.promoCode || ""} to save on your next booking.` };
    case "coupon":
      return { title: "Coupon Applied!", message: `Enjoy ${p.discountText || "a discount"} with coupon ${p.couponCode || ""}. Valid on select routes.` };
    case "coupon_expiring":
      return { title: "Coupon Expiring Soon", message: `Your coupon ${p.couponCode || ""} (${p.discountText || ""}) expires on ${p.expiryDate || "soon"}. Use it now!` };
    case "personalized_offer":
      return { title: "A Deal Just for You", message: `${p.offerTitle || "Special offer"} based on your travel history. Code: ${p.promoCode || ""}.` };
    case "festival_offer":
      return { title: "Festival Special!", message: `${p.offerTitle || "Celebrate with us!"} Use code ${p.promoCode || ""} for extra savings.` };
    // Community
    case "community_activity":
      return { title: "Community Update", message: `${p.actorName || "Someone"} ${p.action || "interacted with your post"}.` };
    case "community_like":
      return { title: "New Like", message: `${p.actorName || "Someone"} liked your post.` };
    case "community_comment":
      return { title: "New Comment", message: `${p.actorName || "Someone"} commented on your post.` };
    case "community_reply":
      return { title: "New Reply", message: `${p.actorName || "Someone"} replied to your comment.` };
    case "community_mention":
      return { title: "You Were Mentioned", message: `${p.actorName || "Someone"} mentioned you in a post/comment.` };
    case "community_post_approved":
      return { title: "Post Approved", message: `Your community post has been approved and is now visible.` };
    case "community_post_moderation":
      return { title: "Post Under Review", message: `Your community post is being reviewed by a moderator.` };
    // Reviews
    case "review_reply":
      return { title: "Reply to Your Review", message: `${p.actorName || "Someone"} replied to your review on ${p.busName || "a bus"}.` };
    // Support
    case "support_ticket_created":
      return { title: "Support Ticket Created", message: `Your support ticket #${p.ticketId || ""} has been created. We'll respond soon.` };
    case "support_agent_reply":
      return { title: "Agent Replied", message: `An agent replied to your ticket #${p.ticketId || ""}. Check your email for details.` };
    case "support_ticket_resolved":
      return { title: "Ticket Resolved", message: `Your support ticket #${p.ticketId || ""} has been resolved.` };
    // Account
    case "account":
      return { title: "Account Update", message: p.detail || "Your account has been updated." };
    case "welcome":
      return { title: "Welcome to TedBus!", message: `Hi ${p.name || "there"}! Your account is set up. Explore routes and book your first trip.` };
    case "profile_incomplete":
      return { title: "Complete Your Profile", message: "Add your phone number and ID proof for faster bookings." };
    // Security
    case "new_login":
      return { title: "New Login Detected", message: `A new login to your account from ${p.device || "a new device"} at ${p.location || "unknown location"}. If this wasn't you, change your password.` };
    case "password_changed":
      return { title: "Password Changed", message: "Your password was changed successfully. If this wasn't you, contact support immediately." };
    case "email_changed":
      return { title: "Email Changed", message: `Your email was changed to ${p.newEmail || "a new address"}. If this wasn't you, contact support.` };
    case "phone_changed":
      return { title: "Phone Changed", message: `Your phone number was changed to ${p.newPhone || "a new number"}. If this wasn't you, contact support.` };
    // System
    case "maintenance":
      return { title: "Scheduled Maintenance", message: `${p.detail || "TedBus will be under maintenance on " + (p.maintenanceDate || "a scheduled date") + ". Services may be briefly unavailable."}` };
    case "service_disruption":
      return { title: "Service Disruption", message: `${p.detail || "We are experiencing temporary service issues. We're working to resolve this."}` };
    case "announcement":
      return { title: "Announcement", message: p.detail || "Important update from TedBus." };
    default:
      return { title: "Notification", message: p.detail || "" };
  }
}

// ======================== HINDI TRANSLATOR ========================

function tHi(type, p) {
  const R = p.route || "", D = p.date || "", T = p.time || "", BID = p.bookingId || "";
  switch (type) {
    case "booking_confirmed":
      return { title: "बुकिंग की पुष्टि!", message: `${R} पर ${D} को ${T} की यात्रा की पुष्टि हो गई। टिकट आईडी: ${BID}।` };
    case "booking_cancelled":
      return { title: "बुकिंग रद्द", message: `${R} (${D}, ${T}) बुकिंग (टिकट: ${BID}) रद्द कर दी गई।` };
    case "payment_successful":
      return { title: "भुगतान सफल", message: `बुकिंग ${BID} (${R}) के लिए ₹${p.amount || ""} का भुगतान सफलतापूर्वक प्राप्त हुआ।` };
    case "payment_failed":
      return { title: "भुगतान विफल", message: `बुकिंग ${BID} (${R}) के लिए ₹${p.amount || ""} का भुगतान विफल। ${p.reason || "कृपया पुनः प्रयास करें।"}` };
    case "payment_pending":
      return { title: "भुगतान लंबित", message: `बुकिंग ${BID} (${R}) के लिए ₹${p.amount || ""} का भुगतान लंबित है। ${p.reason || "हम जल्द ही अपडेट करेंगे।"}` };
    case "journey_reminder":
    case "trip_reminder_24h":
      return { title: "यात्रा रिमाइंडर (24 घंटे)", message: `आपकी बस ${R} ${D} को ${T} पर रवाना होगी। यात्रा की योजना बनाएं।` };
    case "trip_reminder_6h":
      return { title: "यात्रा रिमाइंडर (6 घंटे)", message: `आपकी बस ${R} ${D} को ${T} पर रवाना होगी। तैयार हो जाएं।` };
    case "trip_reminder_2h":
      return { title: "यात्रा रिमाइंडर (2 घंटे)", message: `आपकी बस ${R} ${D} को ${T} पर रवाना होगी। बोर्डिंग पॉइंट की ओर चलें।` };
    case "trip_reminder_1h":
      return { title: "यात्रा रिमाइंडर (1 घंटा)", message: `आपकी बस ${R} ${D} को ${T} पर रवाना होगी। बोर्डिंग पॉइंट पर पहुँचें!` };
    case "trip_reminder_30m":
      return { title: "यात्रा रिमाइंडर (30 मिनट)", message: `आपकी बस ${R} ${D} को ${T} पर रवाना होगी। अभी बोर्ड करें!` };
    case "boarding_reminder":
      return { title: "बोर्डिंग रिमाइंडर", message: `${R} पर ${D} की आपकी बस बोर्ड हो रही है। कृपया गेट पर हों।` };
    case "journey_completed":
      return { title: "यात्रा पूर्ण", message: `${R} पर ${D} की आपकी यात्रा पूर्ण हुई। TedBus के साथ यात्रा के लिए धन्यवाद!` };
    case "bus_delayed":
      return { title: "बस में देरी", message: `${p.busName || "आपकी बस"} (${R}, ${D}) ${p.delayMinutes || 0} मिनट देरी से है। नया समय: ${p.newTime || T}।` };
    case "bus_rescheduled":
      return { title: "बस पुनर्निर्धारित", message: `${p.busName || "आपकी बस"} (${R}, ${D}) पुनर्निर्धारित। नया समय: ${p.newTime || T}।` };
    case "bus_cancelled":
      return { title: "बस रद्द", message: `${p.busName || "आपकी बस"} (${R}, ${D}) रद्द कर दी गई है। कृपया सहायता से संपर्क करें।` };
    case "boarding_point_changed":
      return { title: "बोर्डिंग पॉइंट बदला गया", message: `${R} (${D}) का बोर्डिंग पॉइंट बदलकर: ${p.newBoardingPoint || "नया स्थान"} किया गया।` };
    case "timing_changed":
      return { title: "समय बदला गया", message: `${R} (${D}) का प्रस्थान समय ${T} से बदलकर ${p.newTime || "नया समय"} किया गया।` };
    case "route_changed":
      return { title: "मार्ग बदला गया", message: `${R} (${D}) का मार्ग संशोधित किया गया है। अपडेटेड यात्रा देखें।` };
    case "ticket_cancelled":
      return { title: "टिकट रद्द", message: `${R} (${D}) के लिए आपका टिकट ${BID} रद्द कर दिया गया है।` };
    case "refund_initiated":
      return { title: "रिफंड शुरू", message: `टिकट ${BID} के लिए ₹${p.amount || ""} का रिफंड शुरू किया गया है। 5-7 कार्य दिवस लग सकते हैं।` };
    case "refund_processing":
      return { title: "रिफंड प्रसंस्करण", message: `टिकट ${BID} के लिए ₹${p.amount || ""} का रिफंड प्रसंस्करण में है।` };
    case "refund_successful":
      return { title: "रिफंड सफल", message: `टिकट ${BID} के लिए ₹${p.amount || ""} का रिफंड आपके खाते में जमा हो गया है।` };
    case "refund_failed":
      return { title: "रिफंड विफल", message: `टिकट ${BID} का रिफंड प्रसंस्करण नहीं हो सका। ${p.reason || "कृपया सहायता से संपर्क करें।"}` };
    case "offer":
      return { title: "आपके लिए विशेष ऑफ़र", message: `${p.offerTitle || "विशेष ऑफ़र"}। कोड ${p.promoCode || ""} का उपयोग करें।` };
    case "coupon":
      return { title: "कूपन लागू!", message: `कूपन ${p.couponCode || ""} के साथ ${p.discountText || "छूट"} का आनंद लें।` };
    case "coupon_expiring":
      return { title: "कूपन जल्द समाप्त", message: `आपका कूपन ${p.couponCode || ""} ${p.expiryDate || "जल्द"} को समाप्त हो रहा है। अभी उपयोग करें!` };
    case "personalized_offer":
      return { title: "आपके लिए खास ऑफ़र", message: `${p.offerTitle || "विशेष ऑफ़र"}। कोड: ${p.promoCode || ""}।` };
    case "festival_offer":
      return { title: "त्योहार विशेष!", message: `${p.offerTitle || "हमारे साथ मनाएं!"} कोड ${p.promoCode || ""} से अतिरिक्त बचत।` };
    case "community_activity":
      return { title: "समुदाय अपडेट", message: `${p.actorName || "किसी ने"} ${p.action || "आपकी पोस्ट पर सहभागिता की"}।` };
    case "community_like":
      return { title: "नया लाइक", message: `${p.actorName || "किसी ने"} आपकी पोस्ट लाइक की।` };
    case "community_comment":
      return { title: "नया कमेंट", message: `${p.actorName || "किसी ने"} आपकी पोस्ट पर कमेंट किया।` };
    case "community_reply":
      return { title: "नया उत्तर", message: `${p.actorName || "किसी ने"} आपके कमेंट का उत्तर दिया।` };
    case "community_mention":
      return { title: "आपका उल्लेख", message: `${p.actorName || "किसी ने"} आपका उल्लेख किया।` };
    case "community_post_approved":
      return { title: "पोस्ट स्वीकृत", message: "आपकी समुदाय पोस्ट स्वीकृत हो गई है।" };
    case "community_post_moderation":
      return { title: "पोस्ट समीक्षा में", message: "आपकी समुदाय पोस्ट की समीक्षा हो रही है।" };
    case "review_reply":
      return { title: "समीक्षा का उत्तर", message: `${p.actorName || "किसी ने"} ${p.busName || "बस"} पर आपकी समीक्षा का उत्तर दिया।` };
    case "support_ticket_created":
      return { title: "सहायता टिकट बनाया", message: `आपका सहायता टिकट #${p.ticketId || ""} बनाया गया। हम जल्द ही जवाब देंगे।` };
    case "support_agent_reply":
      return { title: "एजेंट ने उत्तर दिया", message: `एजेंट ने आपके टिकट #${p.ticketId || ""} का उत्तर दिया। विवरण के लिए ईमेल देखें।` };
    case "support_ticket_resolved":
      return { title: "टिकट हल", message: `आपका सहायता टिकट #${p.ticketId || ""} हल हो गया है।` };
    case "account":
      return { title: "खाता अपडेट", message: p.detail || "आपका खाता अपडेट किया गया है।" };
    case "welcome":
      return { title: "TedBus में आपका स्वागत है!", message: `हैलो ${p.name || ""}! आपका खाता तैयार है। मार्ग देखें और अपनी पहली यात्रा बुक करें।` };
    case "profile_incomplete":
      return { title: "प्रोफ़ाइल पूरी करें", message: "तेज़ बुकिंग के लिए अपना फ़ोन नंबर और आईडी प्रूफ जोड़ें।" };
    case "new_login":
      return { title: "नया लॉगिन", message: `${p.device || "नए डिवाइस"} से ${p.location || "अज्ञात स्थान"} पर नया लॉगिन। यदि आप नहीं थे तो पासवर्ड बदलें।` };
    case "password_changed":
      return { title: "पासवर्ड बदला गया", message: "पासवर्ड सफलतापूर्वक बदला गया। यदि आप नहीं थे तो सहायता से संपर्क करें।" };
    case "email_changed":
      return { title: "ईमेल बदला गया", message: `ईमेल बदलकर ${p.newEmail || "नए पते"} पर किया गया। यदि आप नहीं थे तो सहायता से संपर्क करें।` };
    case "phone_changed":
      return { title: "फ़ोन बदला गया", message: `फ़ोन बदलकर ${p.newPhone || "नए नंबर"} पर किया गया। यदि आप नहीं थे तो सहायता से संपर्क करें।` };
    case "maintenance":
      return { title: "अनुसूचित रखरखाव", message: p.detail || `TedBus ${p.maintenanceDate || "निर्धारित तिथि"} को रखरखाव में रहेगा। सेवाएं बाधित हो सकती हैं।` };
    case "service_disruption":
      return { title: "सेवा बाधा", message: p.detail || "अस्थायी सेवा समस्याएं हैं। हम इसे हल करने में लगे हैं।" };
    case "announcement":
      return { title: "घोषणा", message: p.detail || "TedBus से महत्वपूर्ण अपडेट।" };
    default:
      return { title: "सूचना", message: p.detail || "" };
  }
}

// ======================== TAMIL TRANSLATOR ========================

function tTa(type, p) {
  const R = p.route || "", D = p.date || "", T = p.time || "", BID = p.bookingId || "";
  switch (type) {
    case "booking_confirmed":
      return { title: "முன்பதிவு உறுதி!", message: `${R} பயணம் ${D} அன்று ${T} உறுதி. டிக்கெட்: ${BID}.` };
    case "booking_cancelled":
      return { title: "முன்பதிவு ரத்து", message: `${R} (${D}, ${T}) முன்பதிவு (டிக்கெட்: ${BID}) ரத்து செய்யப்பட்டது.` };
    case "payment_successful":
      return { title: "பணம் செலுத்தல் வெற்றி", message: `புக்கிங் ${BID} (${R}) க்கு ₹${p.amount || ""} வெற்றிகரமாக செலுத்தப்பட்டது.` };
    case "payment_failed":
      return { title: "பணம் செலுத்தல் தோல்வி", message: `புக்கிங் ${BID} (${R}) க்கு ₹${p.amount || ""} தோல்வி. ${p.reason || "மீண்டும் முயற்சிக்கவும்."}` };
    case "payment_pending":
      return { title: "பணம் செலுத்தல் நிலுவை", message: `புக்கிங் ${BID} (${R}) க்கு ₹${p.amount || ""} நிலுவையில் உள்ளது.` };
    case "journey_reminder":
    case "trip_reminder_24h":
      return { title: "பயண நினைவூட்டல் (24 மணி)", message: `உங்கள் பேருந்து ${R} ${D} அன்று ${T} புறப்படுகிறது.` };
    case "trip_reminder_6h":
      return { title: "பயண நினைவூட்டல் (6 மணி)", message: `உங்கள் பேருந்து ${R} ${D} அன்று ${T} புறப்படுகிறது. தயாராகுங்கள்.` };
    case "trip_reminder_2h":
      return { title: "பயண நினைவூட்டல் (2 மணி)", message: `உங்கள் பேருந்து ${R} ${D} அன்று ${T} புறப்படுகிறது. ஏற்றும் இடத்திற்கு செல்லுங்கள்.` };
    case "trip_reminder_1h":
      return { title: "பயண நினைவூட்டல் (1 மணி)", message: `உங்கள் பேருந்து ${R} ${D} அன்று ${T} புறப்படுகிறது. ஏற்றும் இடத்தில் இருங்கள்!` };
    case "trip_reminder_30m":
      return { title: "பயண நினைவூட்டல் (30 நிமிடம்)", message: `உங்கள் பேருந்து ${R} ${D} அன்று ${T} புறப்படுகிறது. இப்போது ஏறுங்கள்!` };
    case "boarding_reminder":
      return { title: "ஏற்றும் நினைவூட்டல்", message: `${R} (${D}) பேருந்து ஏற்றப்படுகிறது. கேட்டில் இருங்கள்.` };
    case "journey_completed":
      return { title: "பயணம் முடிந்தது", message: `${R} (${D}) பயணம் முடிந்தது. TedBus உடன் பயணித்ததற்கு நன்றி!` };
    case "bus_delayed":
      return { title: "பேருந்து தாமதம்", message: `${p.busName || "உங்கள் பேருந்து"} (${R}, ${D}) ${p.delayMinutes || 0} நிமிடம் தாமதம். புதிய நேரம்: ${p.newTime || T}.` };
    case "bus_rescheduled":
      return { title: "பேருந்து மறுதிட்டமிடப்பட்டது", message: `${p.busName || "உங்கள் பேருந்து"} (${R}, ${D}) மறுதிட்டமிடப்பட்டது. புதிய நேரம்: ${p.newTime || T}.` };
    case "bus_cancelled":
      return { title: "பேருந்து ரத்து", message: `${p.busName || "உங்கள் பேருந்து"} (${R}, ${D}) ரத்து செய்யப்பட்டது. ஆதரவைத் தொடர்பு கொள்ளுங்கள்.` };
    case "boarding_point_changed":
      return { title: "ஏற்றும் இடம் மாற்றப்பட்டது", message: `${R} (${D}) ஏற்றும் இடம்: ${p.newBoardingPoint || "புதிய இடம்"} என மாற்றப்பட்டது.` };
    case "timing_changed":
      return { title: "நேரம் மாற்றப்பட்டது", message: `${R} (${D}) புறப்பாடு நேரம் ${T} இலிருந்து ${p.newTime || "புதிய நேரம்"} என மாற்றப்பட்டது.` };
    case "route_changed":
      return { title: "வழி மாற்றப்பட்டது", message: `${R} (${D}) வழி மாற்றியமைக்கப்பட்டது. புதுப்பிக்கப்பட்ட பயணத்தை பாருங்கள்.` };
    case "ticket_cancelled":
      return { title: "டிக்கெட் ரத்து", message: `${R} (${D}) டிக்கெட் ${BID} ரத்து செய்யப்பட்டது.` };
    case "refund_initiated":
      return { title: "மீட்பு தொடங்கப்பட்டது", message: `டிக்கெட் ${BID} க்கு ₹${p.amount || ""} மீட்பு தொடங்கப்பட்டது. 5-7 வணிக நாட்கள் ஆகலாம்.` };
    case "refund_processing":
      return { title: "மீட்பு செயலாக்கம்", message: `டிக்கெட் ${BID} க்கு ₹${p.amount || ""} மீட்பு செயலாக்கத்தில் உள்ளது.` };
    case "refund_successful":
      return { title: "மீட்பு வெற்றி", message: `டிக்கெட் ${BID} க்கு ₹${p.amount || ""} மீட்பு உங்கள் கணக்கில் வரவு வைக்கப்பட்டது.` };
    case "refund_failed":
      return { title: "மீட்பு தோல்வி", message: `டிக்கெட் ${BID} மீட்பு செயல்படுத்த முடியவில்லை. ${p.reason || "ஆதரவைத் தொடர்பு கொள்ளுங்கள்."}` };
    case "offer":
      return { title: "சிறப்பு சலுகை", message: `${p.offerTitle || "சிறப்பு சலுகை"}. குறியீடு ${p.promoCode || ""} பயன்படுத்தவும்.` };
    case "coupon":
      return { title: "கூப்பன் பயன்பாட்டில்!", message: `கூப்பன் ${p.couponCode || ""} மூலம் ${p.discountText || "தள்ளுபடி"} பெறுங்கள்.` };
    case "coupon_expiring":
      return { title: "கூப்பன் விரைவில் காலாவதி", message: `உங்கள் கூப்பன் ${p.couponCode || ""} ${p.expiryDate || "விரைவில்"} காலாவதியாகிறது. இப்போது பயன்படுத்துங்கள்!` };
    case "personalized_offer":
      return { title: "உங்களுக்கான சிறப்பு சலுகை", message: `${p.offerTitle || "சிறப்பு சலுகை"}. குறியீடு: ${p.promoCode || ""}.` };
    case "festival_offer":
      return { title: "விழா சிறப்பு!", message: `${p.offerTitle || "நம்முடன் கொண்டாடுங்கள்!"} குறியீடு ${p.promoCode || ""} மூலம் கூடுதல் சேமிப்பு.` };
    case "community_activity":
      return { title: "சமூக புதுப்பிப்பு", message: `${p.actorName || "யாரோ"} ${p.action || "உங்கள் பதிவில் ஈடுபட்டார்"}.` };
    case "community_like":
      return { title: "புதிய விரும்பம்", message: `${p.actorName || "யாரோ"} உங்கள் பதிவை விரும்பினார்.` };
    case "community_comment":
      return { title: "புதிய கருத்து", message: `${p.actorName || "யாரோ"} உங்கள் பதிவில் கருத்து தெரிவித்தார்.` };
    case "community_reply":
      return { title: "புதிய பதில்", message: `${p.actorName || "யாரோ"} உங்கள் கருத்துக்கு பதிலளித்தார்.` };
    case "community_mention":
      return { title: "நீங்கள் குறிப்பிடப்பட்டீர்கள்", message: `${p.actorName || "யாரோ"} உங்களை குறிப்பிட்டார்.` };
    case "community_post_approved":
      return { title: "பதிவு ஒப்புக்கொள்ளப்பட்டது", message: "உங்கள் சமூக பதிவு ஒப்புக்கொள்ளப்பட்டது." };
    case "community_post_moderation":
      return { title: "பதிவு மதிப்பாய்வில்", message: "உங்கள் சமூக பதிவு மதிப்பாய்வு செய்யப்படுகிறது." };
    case "review_reply":
      return { title: "மதிப்பாய்வுக்கு பதில்", message: `${p.actorName || "யாரோ"} ${p.busName || "பேருந்து"} இல் உங்கள் மதிப்பாய்வுக்கு பதிலளித்தார்.` };
    case "support_ticket_created":
      return { title: "ஆதரவு டிக்கெட் உருவாக்கப்பட்டது", message: `ஆதரவு டிக்கெட் #${p.ticketId || ""} உருவாக்கப்பட்டது. விரைவில் பதிலளிப்போம்.` };
    case "support_agent_reply":
      return { title: "ஏஜென்ட் பதிலளித்தார்", message: `ஏஜென்ட் டிக்கெட் #${p.ticketId || ""} க்கு பதிலளித்தார். விவரங்களுக்கு மின்னஞ்சலை பாருங்கள்.` };
    case "support_ticket_resolved":
      return { title: "டிக்கெட் தீர்க்கப்பட்டது", message: `ஆதரவு டிக்கெட் #${p.ticketId || ""} தீர்க்கப்பட்டது.` };
    case "account":
      return { title: "கணக்கு புதுப்பிப்பு", message: p.detail || "உங்கள் கணக்கு புதுப்பிக்கப்பட்டது." };
    case "welcome":
      return { title: "TedBus-க்கு வரவேற்கிறோம்!", message: `வணக்கம் ${p.name || ""}! உங்கள் கணக்கு தயாராக உள்ளது. முதல் பயணத்தை முன்பதிவு செய்யுங்கள்.` };
    case "profile_incomplete":
      return { title: "சுயவிவரத்தை நிரப்புங்கள்", message: "விரைவான முன்பதிவுகளுக்கு உங்கள் தொலைபேசி எண் மற்றும் ஐடி ஆதாரத்தை சேர்க்கவும்." };
    case "new_login":
      return { title: "புதிய உள்நுழைவு", message: `${p.device || "புதிய சாதனம்"} இருந்து புதிய உள்நுழைவு. நீங்கள் இல்லையெனில் கடவுச்சொல்லை மாற்றுங்கள்.` };
    case "password_changed":
      return { title: "கடவுச்சொல் மாற்றப்பட்டது", message: "கடவுச்சொல் வெற்றிகரமாக மாற்றப்பட்டது. நீங்கள் இல்லையெனில் ஆதரவைத் தொடர்பு கொள்ளுங்கள்." };
    case "email_changed":
      return { title: "மின்னஞ்சல் மாற்றப்பட்டது", message: `மின்னஞ்சல் ${p.newEmail || "புதிய முகவரி"} என மாற்றப்பட்டது.` };
    case "phone_changed":
      return { title: "தொலைபேசி மாற்றப்பட்டது", message: `தொலைபேசி ${p.newPhone || "புதிய எண்"} என மாற்றப்பட்டது.` };
    case "maintenance":
      return { title: "திட்டமிடப்பட்ட பராமரிப்பு", message: p.detail || `TedBus ${p.maintenanceDate || "நிர்ணயிக்கப்பட்ட தேதி"} அன்று பராமரிப்பில் இருக்கும்.` };
    case "service_disruption":
      return { title: "சேவை இடையூறு", message: p.detail || "தற்காலிக சேவை சிக்கல்கள் உள்ளன. தீர்க்க முயற்சிக்கிறோம்." };
    case "announcement":
      return { title: "அறிவிப்பு", message: p.detail || "TedBus இலிருந்து முக்கியமான புதுப்பிப்பு." };
    default:
      return { title: "அறிவிப்பு", message: p.detail || "" };
  }
}

// ======================== TELUGU TRANSLATOR ========================

function tTe(type, p) {
  const R = p.route || "", D = p.date || "", T = p.time || "", BID = p.bookingId || "";
  switch (type) {
    case "booking_confirmed":
      return { title: "బుకింగ్ ధృవీకరించబడింది!", message: `${R} ప్రయాణం ${D}న ${T}కి ధృవీకరించబడింది. టికెట్: ${BID}.` };
    case "booking_cancelled":
      return { title: "బుకింగ్ రద్దు", message: `${R} (${D}, ${T}) బుకింగ్ (టికెట్: ${BID}) రద్దు చేయబడింది.` };
    case "payment_successful":
      return { title: "చెల్లింపు విజయవంతం", message: `బుకింగ్ ${BID} (${R}) కోసం ₹${p.amount || ""} విజయవంతంగా చెల్లించబడింది.` };
    case "payment_failed":
      return { title: "చెల్లింపు విఫలం", message: `బుకింగ్ ${BID} (${R}) కోసం ₹${p.amount || ""} విఫలం. ${p.reason || "మళ్ళీ ప్రయత్నించండి."}` };
    case "payment_pending":
      return { title: "చెల్లింపు పెండింగ్", message: `బుకింగ్ ${BID} (${R}) కోసం ₹${p.amount || ""} పెండింగ్‌లో ఉంది.` };
    case "journey_reminder":
    case "trip_reminder_24h":
      return { title: "ట్రిప్ రైండర్ (24 గంటలు)", message: `మీ బస్సు ${R} ${D}న ${T}కి బయలుదేరుతుంది.` };
    case "trip_reminder_6h":
      return { title: "ట్రిప్ రైండర్ (6 గంటలు)", message: `మీ బస్సు ${R} ${D}న ${T}కి బయలుదేరుతుంది. సిద్ధం అవ్వండి.` };
    case "trip_reminder_2h":
      return { title: "ట్రిప్ రైండర్ (2 గంటలు)", message: `మీ బస్సు ${R} ${D}న ${T}కి బయలుదేరుతుంది. బోర్డింగ్ పాయింట్ వైపు వెళ్ళండి.` };
    case "trip_reminder_1h":
      return { title: "ట్రిప్ రైండర్ (1 గంట)", message: `మీ బస్సు ${R} ${D}న ${T}కి బయలుదేరుతుంది. బోర్డింగ్ పాయింట్ వద్ద ఉండండి!` };
    case "trip_reminder_30m":
      return { title: "ట్రిప్ రైండర్ (30 నిమిషాలు)", message: `మీ బస్సు ${R} ${D}న ${T}కి బయలుదేరుతుంది. ఇప్పుడు ఎక్కండి!` };
    case "boarding_reminder":
      return { title: "బోర్డింగ్ రైండర్", message: `${R} (${D}) బస్సు బోర్డ్ అవుతోంది. గేట్ వద్ద ఉండండి.` };
    case "journey_completed":
      return { title: "ప్రయాణం పూర్తయింది", message: `${R} (${D}) ప్రయాణం పూర్తయింది. TedBusతో ప్రయాణించినందుకు ధన్యవాదాలు!` };
    case "bus_delayed":
      return { title: "బస్సు ఆలస్యం", message: `${p.busName || "మీ బస్సు"} (${R}, ${D}) ${p.delayMinutes || 0} నిమిషాలు ఆలస్యం. కొత్త సమయం: ${p.newTime || T}.` };
    case "bus_rescheduled":
      return { title: "బస్సు పునఃనిర్ణయించబడింది", message: `${p.busName || "మీ బస్సు"} (${R}, ${D}) పునఃనిర్ణయించబడింది. కొత్త సమయం: ${p.newTime || T}.` };
    case "bus_cancelled":
      return { title: "బస్సు రద్దు", message: `${p.busName || "మీ బస్సు"} (${R}, ${D}) రద్దు చేయబడింది. సపోర్ట్‌ని సంప్రదించండి.` };
    case "boarding_point_changed":
      return { title: "బోర్డింగ్ పాయింట్ మార్చబడింది", message: `${R} (${D}) బోర్డింగ్ పాయింట్: ${p.newBoardingPoint || "కొత్త ప్రదేశం"} గా మార్చబడింది.` };
    case "timing_changed":
      return { title: "సమయం మార్చబడింది", message: `${R} (${D}) బయలుదేరే సమయం ${T} నుండి ${p.newTime || "కొత్త సమయం"} గా మార్చబడింది.` };
    case "route_changed":
      return { title: "మార్గం మార్చబడింది", message: `${R} (${D}) మార్గం సవరించబడింది. అప్డేట్ చేసిన ఇటినరీ చూడండి.` };
    case "ticket_cancelled":
      return { title: "టికెట్ రద్దు", message: `${R} (${D}) టికెట్ ${BID} రద్దు చేయబడింది.` };
    case "refund_initiated":
      return { title: "రిఫండ్ ప్రారంభించబడింది", message: `టికెట్ ${BID} కోసం ₹${p.amount || ""} రిఫండ్ ప్రారంభించబడింది. 5-7 వ్యాపార రోజులు పట్టవచ్చు.` };
    case "refund_processing":
      return { title: "రిఫండ్ ప్రాసెసింగ్", message: `టికెట్ ${BID} కోసం ₹${p.amount || ""} రిఫండ్ ప్రాసెస్ అవుతోంది.` };
    case "refund_successful":
      return { title: "రిఫండ్ విజయవంతం", message: `టికెట్ ${BID} కోసం ₹${p.amount || ""} రిఫండ్ మీ ఖాతాలో జమ చేయబడింది.` };
    case "refund_failed":
      return { title: "రిఫండ్ విఫలం", message: `టికెట్ ${BID} రిఫండ్ ప్రాసెస్ చేయలేకపోయింది. ${p.reason || "సపోర్ట్‌ని సంప్రదించండి."}` };
    case "offer":
      return { title: "మీ కోసం ప్రత్యేక ఆఫర్", message: `${p.offerTitle || "ప్రత్యేక ఆఫర్"}. కోడ్ ${p.promoCode || ""} ఉపయోగించండి.` };
    case "coupon":
      return { title: "కూపన్ వర్తించింది!", message: `కూపన్ ${p.couponCode || ""}తో ${p.discountText || "డిస్కౌంట్"} పొందండి.` };
    case "coupon_expiring":
      return { title: "కూపన్ త్వరలో గడువు ముగుస్తుంది", message: `మీ కూపన్ ${p.couponCode || ""} ${p.expiryDate || "త్వరలో"} గడువు ముగుస్తుంది. ఇప్పుడు ఉపయోగించండి!` };
    case "personalized_offer":
      return { title: "మీ కోసం ప్రత్యేకం", message: `${p.offerTitle || "ప్రత్యేక ఆఫర్"}. కోడ్: ${p.promoCode || ""}.` };
    case "festival_offer":
      return { title: "పండుగ ప్రత్యేకం!", message: `${p.offerTitle || "మాతో జరుపుకోండి!"} కోడ్ ${p.promoCode || ""}తో అదనపు ఆదా.` };
    case "community_activity":
      return { title: "కమ్యూనిటీ అప్డేట్", message: `${p.actorName || "ఎవరో"} ${p.action || "మీ పోస్ట్‌తో సంబంధం కలిగి ఉన్నారు"}.` };
    case "community_like":
      return { title: "కొత్త లైక్", message: `${p.actorName || "ఎవరో"} మీ పోస్ట్ లైక్ చేశారు.` };
    case "community_comment":
      return { title: "కొత్త కామెంట్", message: `${p.actorName || "ఎవరో"} మీ పోస్ట్‌పై కామెంట్ చేశారు.` };
    case "community_reply":
      return { title: "కొత్త సమాధానం", message: `${p.actorName || "ఎవరో"} మీ కామెంట్‌కు సమాధానం ఇచ్చారు.` };
    case "community_mention":
      return { title: "మిమ్మల్ని ప్రస్తావించారు", message: `${p.actorName || "ఎవరో"} మిమ్మల్ని ప్రస్తావించారు.` };
    case "community_post_approved":
      return { title: "పోస్ట్ ఆమోదించబడింది", message: "మీ కమ్యూనిటీ పోస్ట్ ఆమోదించబడింది." };
    case "community_post_moderation":
      return { title: "పోస్ట్ సమీక్షలో ఉంది", message: "మీ కమ్యూనిటీ పోస్ట్ సమీక్షించబడుతోంది." };
    case "review_reply":
      return { title: "సమీక్షకు సమాధానం", message: `${p.actorName || "ఎవరో"} ${p.busName || "బస్సు"}పై మీ సమీక్షకు సమాధానం ఇచ్చారు.` };
    case "support_ticket_created":
      return { title: "సపోర్ట్ టికెట్ సృష్టించబడింది", message: `మీ సపోర్ట్ టికెట్ #${p.ticketId || ""} సృష్టించబడింది. త్వరలో ప్రతిస్పందిస్తాము.` };
    case "support_agent_reply":
      return { title: "ఏజెంట్ సమాధానం ఇచ్చారు", message: `ఏజెంట్ మీ టికెట్ #${p.ticketId || ""} కు సమాధానం ఇచ్చారు. వివరాలకు ఇమెయిల్ చూడండి.` };
    case "support_ticket_resolved":
      return { title: "టికెట్ పరిష్కరించబడింది", message: `సపోర్ట్ టికెట్ #${p.ticketId || ""} పరిష్కరించబడింది.` };
    case "account":
      return { title: "ఖాతా అప్డేట్", message: p.detail || "మీ ఖాతా అప్డేట్ చేయబడింది." };
    case "welcome":
      return { title: "TedBusకు స్వాగతం!", message: `హాయ్ ${p.name || ""}! మీ ఖాతా సిద్ధంగా ఉంది. మొదటి ట్రిప్ బుక్ చేయండి.` };
    case "profile_incomplete":
      return { title: "ప్రొఫైల్ పూర్తి చేయండి", message: "వేగవంతమైన బుకింగ్‌ల కోసం మీ ఫోన్ నంబర్ మరియు ఐడి ప్రూఫ్ జోడించండి." };
    case "new_login":
      return { title: "కొత్త లాగిన్", message: `${p.device || "కొత్త పరికరం"} నుండి కొత్త లాగిన్. మీరు కాకపోతే పాస్‌వర్డ్ మార్చండి.` };
    case "password_changed":
      return { title: "పాస్‌వర్డ్ మార్చబడింది", message: "పాస్‌వర్డ్ విజయవంతంగా మార్చబడింది. మీరు కాకపోతే సపోర్ట్‌ని సంప్రదించండి." };
    case "email_changed":
      return { title: "ఇమెయిల్ మార్చబడింది", message: `ఇమెయిల్ ${p.newEmail || "కొత్త చిరునామా"} గా మార్చబడింది.` };
    case "phone_changed":
      return { title: "ఫోన్ మార్చబడింది", message: `ఫోన్ ${p.newPhone || "కొత్త నంబర్"} గా మార్చబడింది.` };
    case "maintenance":
      return { title: "షెడ్యూల్డ్ మెయింటెనెన్స్", message: p.detail || `TedBus ${p.maintenanceDate || "షెడ్యూల్డ్ తేదీ"}న మెయింటెనెన్స్‌లో ఉంటుంది.` };
    case "service_disruption":
      return { title: "సేవా అంతరాయం", message: p.detail || "తాత్కాలిక సేవా సమస్యలు ఉన్నాయి. పరిష్కరించడానికి ప్రయత్నిస్తున్నాము." };
    case "announcement":
      return { title: "ప్రకటన", message: p.detail || "TedBus నుండి ముఖ్యమైన అప్డేట్." };
    default:
      return { title: "నోటిఫికేషన్", message: p.detail || "" };
  }
}

// ======================== KANNADA & MALAYALAM (ENGLISH FALLBACK) ========================

function tKn(type, p) { return tEn(type, p); }
function tMl(type, p) { return tEn(type, p); }

const FALLBACK = tEn;
const TRANSLATORS = { en: tEn, hi: tHi, ta: tTa, te: tTe, kn: tKn, ml: tMl };

function translate(type, locale, p) {
  const fn = TRANSLATORS[locale] || FALLBACK;
  return fn(type, p);
}

// ======================== PREFERENCES ========================

async function getOrCreatePreferences(userId) {
  let prefs = await NotificationPreference.findOne({ userId }).lean().exec();
  if (prefs) {
    // Migration: push was previously disabled by default, so any existing
    // preference document with channels.push === false was never an
    // intentional user choice — push was simply never functional. Upgrade
    // it to true so that users who have granted browser notification
    // permission actually receive push notifications.
    if (prefs.channels && prefs.channels.push === false) {
      await NotificationPreference.updateOne(
        { _id: prefs._id },
        { $set: { "channels.push": true, updatedAt: new Date() } }
      );
      prefs = { ...prefs, channels: { ...prefs.channels, push: true } };
    }
    return prefs;
  }
  const doc = await NotificationPreference.create({ userId });
  return doc.toObject();
}

function isChannelEnabledForCategory(prefs, category, channel) {
  if (!prefs) return true;
  if (prefs.channels && prefs.channels[channel] === false) return false;
  const catPref = prefs.categories && prefs.categories[category];
  if (!catPref) return true;
  if (catPref.enabled === false) return false;
  if (catPref[channel] === false) return false;
  return true;
}
// ======================== DELIVERY HELPERS ========================

async function deliverInapp(notification) {
  await Notification.updateOne(
    { _id: notification._id },
    {
      $set: {
        "channels.inapp.status": "sent",
        "channels.inapp.deliveredAt": new Date(),
        "channels.inapp.attemptCount": (notification.channels.inapp?.attemptCount || 0) + 1,
        "channels.inapp.error": null,
      },
    }
  );
}

function makeTransporter() {
  if (!nodemailer || !EMAIL_CONFIG.host || !EMAIL_CONFIG.user || !EMAIL_CONFIG.pass) return null;
  return nodemailer.createTransport({
    host: EMAIL_CONFIG.host,
    port: EMAIL_CONFIG.port,
    secure: Number(EMAIL_CONFIG.port) === 465,
    auth: { user: EMAIL_CONFIG.user, pass: EMAIL_CONFIG.pass },
  });
}

function buildEmailHtml(notification) {
  const catLabel = CATEGORY_LABEL[notification.category] || "Notification";
  const priorityBanner =
    notification.priority === "critical"
      ? `<div style="background:#dc2626;color:#fff;padding:8px 14px;border-radius:6px 6px 0 0;font-weight:700;font-size:13px">URGENT</div>`
      : notification.priority === "high"
      ? `<div style="background:#ea580c;color:#fff;padding:8px 14px;border-radius:6px 6px 0 0;font-weight:700;font-size:13px">Important</div>`
      : "";
  return `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
    ${priorityBanner}
    <div style="background:#d84e55;padding:20px 24px;text-align:center">
      <h1 style="color:#fff;margin:0;font-size:22px">TedBus</h1>
    </div>
    <div style="padding:24px">
      <h2 style="color:#1f2937;margin:0 0 6px;font-size:18px">${notification.title}</h2>
      <p style="color:#6b7280;font-size:13px;margin:0 0 14px">${catLabel}</p>
      <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 18px">${notification.message}</p>
      ${notification.link ? `<p style="margin:0 0 18px"><a href="${notification.link}" style="background:#d84e55;color:#fff;padding:11px 22px;border-radius:6px;text-decoration:none;display:inline-block;font-weight:600;font-size:14px">View Details</a></p>` : ""}
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:18px 0">
      <p style="color:#9ca3af;font-size:12px;margin:0">You received this because notifications are enabled for the "${catLabel}" category in your <a href="/notification-preferences" style="color:#d84e55">preferences</a>.</p>
    </div>
  </div>`;
}

async function deliverEmail(notification) {
  const attempt = (notification.channels.email?.attemptCount || 0) + 1;
  const mark = (status, error) =>
    Notification.updateOne(
      { _id: notification._id },
      {
        $set: {
          "channels.email.status": status,
          "channels.email.error": error || null,
          "channels.email.attemptCount": attempt,
          "channels.email.retriedAt": status === "failed" ? new Date() : null,
          "channels.email.deliveredAt": status === "sent" ? new Date() : null,
        },
      }
    );

  if (!nodemailer) return mark("failed", "Email library (nodemailer) is not installed.");
  if (!EMAIL_CONFIG.host || !EMAIL_CONFIG.user || !EMAIL_CONFIG.pass) {
    return mark("failed", "SMTP not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS env vars.");
  }
  const transporter = makeTransporter();
  if (!transporter) return mark("failed", "SMTP not configured.");

  const customer = await Customer.findById(notification.userId).lean().exec();
  const to = customer ? customer.email : notification.payload.to;
  if (!to) return mark("failed", "Recipient email not available.");

  try {
    await transporter.sendMail({
      from: EMAIL_CONFIG.from,
      to,
      subject: notification.title,
      html: buildEmailHtml(notification),
    });
    return mark("sent", null);
  } catch (err) {
    return mark("failed", err.message || "SMTP send failed.");
  }
}

async function deliverPush(notification) {
  const attempt = (notification.channels.push?.attemptCount || 0) + 1;
  const mark = (status, error) =>
    Notification.updateOne(
      { _id: notification._id },
      {
        $set: {
          "channels.push.status": status,
          "channels.push.error": error || null,
          "channels.push.attemptCount": attempt,
          "channels.push.retriedAt": status === "failed" ? new Date() : null,
          "channels.push.deliveredAt": status === "sent" ? new Date() : null,
        },
      }
    );

  const subs = await PushSubscription.find({ userId: notification.userId }).lean().exec();
  if (!subs.length) return mark("failed", "No push device registered.");
  if (!webPush) return mark("failed", "Push library (web-push) is not installed.");

  const payload = JSON.stringify({
    title: notification.title,
    body: notification.message,
    url: notification.link || "/notifications",
    priority: notification.priority,
  });

  const results = await Promise.allSettled(
    subs.map((s) =>
      webPush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } },
        payload
      )
    )
  );

  const stale = [];
  const failures = [];
  for (let i = 0; i < results.length; i++) {
    if (results[i].status === "fulfilled") {
      console.log(`[push] delivered to ${subs[i].endpoint.slice(0, 60)}`);
    } else {
      const code = results[i].reason?.statusCode || 0;
      if (code === 404 || code === 410) stale.push(subs[i].endpoint);
      else failures.push(subs[i].endpoint);
    }
  }
  if (stale.length) {
    await PushSubscription.deleteMany({ userId: notification.userId, endpoint: { $in: stale } });
  }
  if (failures.length) {
    return mark("failed", `${failures.length} device(s) failed, ${stale.length} stale removed.`);
  }
  if (stale.length) {
    // All subscriptions were stale (404/410) and have been cleaned up.
    // This is NOT a failure — the cleanup succeeded. The user will get
    // notifications again once they re-enable push on a device.
    return mark("sent", null);
  }
  return mark("sent", null);
}

// ======================== CREATE / DEDUP ========================

async function createNotification({ userId, category, type, params, payload, link, dedupKey, channels, priority }) {
  if (!userId || !type) return null;
  const validTypes = Notification.schema.paths.type.enumValues;
  if (!validTypes.includes(type)) return null;

  if (dedupKey) {
    const existing = await Notification.findOne({ userId, dedupKey }).lean().exec();
    if (existing) return existing;
  }

  const prefs = await getOrCreatePreferences(userId);
  const locale = prefs.locale || "en";

  const rendered = translate(type, locale, params || {});
  const channelList = channels && channels.length ? channels : ["inapp", "email", "push"];
  const channelsState = {};

  for (const ch of ["inapp", "email", "push"]) {
    if (!channelList.includes(ch)) {
      channelsState[ch] = { status: "disabled", attemptCount: 0 };
    } else if (!isChannelEnabledForCategory(prefs, category, ch)) {
      channelsState[ch] = { status: "disabled", attemptCount: 0 };
    } else {
      channelsState[ch] = { status: "pending", attemptCount: 0 };
    }
  }

  const validPriorities = ["low", "normal", "high", "critical"];
  const notifPriority = validPriorities.includes(priority) ? priority : "normal";

  const doc = await Notification.create({
    userId,
    category,
    type,
    title: rendered.title,
    message: rendered.message,
    locale,
    priority: notifPriority,
    link: link || null,
    payload: payload || {},
    dedupKey: dedupKey || null,
    channels: channelsState,
  });

  const notif = doc.toObject();

  if (channelsState.inapp?.status === "pending") await deliverInapp(notif);
  if (channelsState.email?.status === "pending") {
    await deliverEmail(notif).catch((e) => console.error("email deliver error", e.message));
  }
  if (channelsState.push?.status === "pending") {
    await deliverPush(notif).catch((e) => console.error("push deliver error", e.message));
  }

  try {
    const { emitToUser } = require("./socket");
    emitToUser(String(userId), "notification:new", { notification: doc.toObject() });
  } catch (e) {
    console.error("notification realtime emit error:", e.message);
  }

  return doc;
}

async function retryChannel(notificationId, channel) {
  const doc = await Notification.findById(notificationId).exec();
  if (!doc) return { ok: false, error: "Notification not found." };
  if (!["inapp", "email", "push"].includes(channel)) return { ok: false, error: "Unknown channel." };
  const notif = doc.toObject();
  if (channel === "inapp") await deliverInapp(notif);
  else if (channel === "email") await deliverEmail(notif);
  else if (channel === "push") await deliverPush(notif);
  const updated = await Notification.findById(notificationId).lean().exec();
  return { ok: true, channel: updated.channels[channel] };
}

// ======================== AUTOMATIC RETRY ========================

const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 15 * 60 * 1000;

async function retryFailedChannels() {
  const now = Date.now();
  let retried = 0;
  for (const channel of ["email", "push"]) {
    const filter = {
      [`channels.${channel}.status`]: "failed",
      [`channels.${channel}.attemptCount`]: { $lt: MAX_RETRY_ATTEMPTS },
    };
    const docs = await Notification.find(filter).sort({ createdAt: 1 }).limit(50).lean().exec();
    for (const doc of docs) {
      const lastRetry = doc.channels[channel].retriedAt ? new Date(doc.channels[channel].retriedAt).getTime() : 0;
      if (now - lastRetry < RETRY_DELAY_MS) continue;
      if (channel === "email") await deliverEmail(doc).catch(() => {});
      else await deliverPush(doc).catch(() => {});
      retried += 1;
    }
  }
  if (retried) console.log(`[notifications] Retried ${retried} failed channel(s).`);
  return retried;
}

// ======================== BUSINESS TRIGGERS ========================

function parseDepartureLocal(dd) {
  if (!dd || !dd.date) return null;
  let totalMinutes;
  if (typeof dd.time === "string") {
    const m = dd.time.trim().match(/^(\d{1,2}):(\d{1,2})$/);
    totalMinutes = m ? Number(m[1]) * 60 + Number(m[2]) : Math.round(Number(dd.time) * 60);
  } else {
    const t = Number(dd.time);
    totalMinutes = Number.isFinite(t) ? Math.round(t * 60) : 0;
  }
  if (!Number.isFinite(totalMinutes) || totalMinutes < 0) totalMinutes = 0;
  const h = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const dm = String(dd.date).match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!dm) return null;
  return new Date(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3]), h, minutes, 0, 0);
}

// -- Booking --
async function notifyBookingConfirmed(booking) {
  if (!booking) return null;
  const params = {
    route: `${booking.departureDetails?.city} → ${booking.arrivalDetails?.city}`,
    date: booking.departureDetails?.date,
    time: fmtTime(booking.departureDetails?.time),
    bookingId: booking.pnr || (booking._id ? String(booking._id).slice(-8).toUpperCase() : ""),
    seats: Array.isArray(booking.seats) ? booking.seats.join(", ") : booking.seats,
    fare: booking.fare,
  };
  return createNotification({
    userId: String(booking.customerId), category: "booking", type: "booking_confirmed",
    params, priority: "high",
    payload: { bookingId: String(booking._id), pnr: booking.pnr || "", route: params.route, seats: booking.seats, fare: booking.fare },
    link: `/profile`, dedupKey: `booking_confirmed_${booking._id}`,
    channels: ["inapp", "push"],
  });
}

async function notifyBookingCancelled(booking) {
  if (!booking) return null;
  const params = {
    route: `${booking.departureDetails?.city} → ${booking.arrivalDetails?.city}`,
    date: booking.departureDetails?.date,
    time: fmtTime(booking.departureDetails?.time),
    bookingId: booking.pnr || (booking._id ? String(booking._id).slice(-8).toUpperCase() : ""),
  };
  return createNotification({
    userId: String(booking.customerId), category: "booking", type: "booking_cancelled",
    params, priority: "high",
    payload: { bookingId: String(booking._id), route: params.route },
    link: `/profile`, dedupKey: `booking_cancelled_${booking._id}`,
    channels: ["inapp", "email", "push"],
  });
}

// -- Payment --
async function notifyPaymentSuccessful(booking, amount) {
  if (!booking) return null;
  const params = {
    route: `${booking.departureDetails?.city} → ${booking.arrivalDetails?.city}`,
    date: booking.departureDetails?.date,
    time: fmtTime(booking.departureDetails?.time),
    bookingId: booking.pnr || (booking._id ? String(booking._id).slice(-8).toUpperCase() : ""),
    amount: amount || booking.fare,
  };
  return createNotification({
    userId: String(booking.customerId), category: "payment", type: "payment_successful",
    params, priority: "high",
    payload: { bookingId: String(booking._id), amount: amount || booking.fare },
    link: `/profile`, dedupKey: `payment_successful_${booking._id}`,
    channels: ["inapp", "email", "push"],
  });
}

async function notifyPaymentFailed(booking, amount, reason) {
  if (!booking) return null;
  const params = {
    route: `${booking.departureDetails?.city} → ${booking.arrivalDetails?.city}`,
    date: booking.departureDetails?.date,
    time: fmtTime(booking.departureDetails?.time),
    bookingId: booking.pnr || (booking._id ? String(booking._id).slice(-8).toUpperCase() : ""),
    amount, reason,
  };
  return createNotification({
    userId: String(booking.customerId), category: "payment", type: "payment_failed",
    params, priority: "critical",
    payload: { bookingId: String(booking._id), amount, reason },
    link: `/profile`, dedupKey: `payment_failed_${booking._id}_${Date.now()}`,
    channels: ["inapp", "email", "push"],
  });
}

async function notifyPaymentPending(booking, amount, reason) {
  if (!booking) return null;
  const params = {
    route: `${booking.departureDetails?.city} → ${booking.arrivalDetails?.city}`,
    date: booking.departureDetails?.date,
    time: fmtTime(booking.departureDetails?.time),
    bookingId: booking.pnr || (booking._id ? String(booking._id).slice(-8).toUpperCase() : ""),
    amount, reason,
  };
  return createNotification({
    userId: String(booking.customerId), category: "payment", type: "payment_pending",
    params, priority: "normal",
    payload: { bookingId: String(booking._id), amount, reason },
    link: `/profile`, dedupKey: `payment_pending_${booking._id}_${Date.now()}`,
    channels: ["inapp", "push"],
  });
}

// -- 5-Tier Trip Reminders --
async function sendTripReminders() {
  const now = new Date();
  const tiers = [
    { tier: "24h", ms: 24 * 60 * 60 * 1000, type: "trip_reminder_24h", priority: "normal" },
    { tier: "6h",  ms: 6 * 60 * 60 * 1000,  type: "trip_reminder_6h",  priority: "normal" },
    { tier: "2h",  ms: 2 * 60 * 60 * 1000,  type: "trip_reminder_2h",  priority: "high" },
    { tier: "1h",  ms: 1 * 60 * 60 * 1000,  type: "trip_reminder_1h",  priority: "high" },
    { tier: "30m", ms: 30 * 60 * 1000,       type: "trip_reminder_30m", priority: "critical" },
  ];

  const upcoming = await Booking.find({ status: { $in: ["upcoming", "ticket_confirmed", "payment_verified"] } }).lean().exec();
  let sent = 0;

  for (const booking of upcoming) {
    const departure = parseDepartureLocal(booking.departureDetails);
    if (!departure || departure <= now) continue;

    const prefs = await getOrCreatePreferences(String(booking.customerId));
    const enabledTiers = prefs.reminderTiers || ["24h", "2h", "30m"];

    for (const tier of tiers) {
      if (!enabledTiers.includes(tier.tier)) continue;
      const windowStart = new Date(departure.getTime() - tier.ms - 15 * 60 * 1000);
      const windowEnd = new Date(departure.getTime() - tier.ms + 15 * 60 * 1000);
      if (now < windowStart || now > windowEnd) continue;

      const dedupKey = `trip_reminder_${tier.tier}_${booking._id}`;
      const alreadyReminded = await Notification.findOne({ userId: String(booking.customerId), dedupKey }).lean().exec();
      if (alreadyReminded) continue;

      const hoursBefore = Math.round(tier.ms / (60 * 60 * 1000));
      const params = {
        route: `${booking.departureDetails?.city} → ${booking.arrivalDetails?.city}`,
        date: booking.departureDetails?.date,
        time: fmtTime(booking.departureDetails?.time),
        bookingId: booking.pnr || String(booking._id).slice(-8).toUpperCase(),
        hoursBefore,
      };
      const n = await createNotification({
        userId: String(booking.customerId), category: "journey", type: tier.type,
        params, priority: tier.priority,
        payload: { bookingId: String(booking._id), tier: tier.tier },
        link: `/profile`, dedupKey,
        channels: ["inapp", "email", "push"],
      });
      if (n) sent += 1;
    }
  }
  if (sent) console.log(`[notifications] Sent ${sent} trip reminder(s) across all tiers.`);
  return sent;
}

// Legacy alias for backward compatibility with old scheduler
async function sendJourneyReminders() { return sendTripReminders(); }

// -- Boarding / Journey Completed --
async function notifyBoardingReminder(booking) {
  if (!booking) return null;
  const params = {
    route: `${booking.departureDetails?.city} → ${booking.arrivalDetails?.city}`,
    date: booking.departureDetails?.date,
    time: fmtTime(booking.departureDetails?.time),
    bookingId: booking.pnr || String(booking._id).slice(-8).toUpperCase(),
  };
  return createNotification({
    userId: String(booking.customerId), category: "journey", type: "boarding_reminder",
    params, priority: "high",
    payload: { bookingId: String(booking._id) },
    link: `/profile`, dedupKey: `boarding_reminder_${booking._id}`,
    channels: ["inapp", "push"],
  });
}

async function notifyJourneyCompleted(booking) {
  if (!booking) return null;
  const params = {
    route: `${booking.departureDetails?.city} → ${booking.arrivalDetails?.city}`,
    date: booking.departureDetails?.date,
    time: fmtTime(booking.departureDetails?.time),
    bookingId: booking.pnr || String(booking._id).slice(-8).toUpperCase(),
  };
  return createNotification({
    userId: String(booking.customerId), category: "journey", type: "journey_completed",
    params, priority: "normal",
    payload: { bookingId: String(booking._id) },
    link: `/profile`, dedupKey: `journey_completed_${booking._id}`,
    channels: ["inapp", "push"],
  });
}

// -- Cancellation & Refund --
async function notifyTicketCancelled(booking) {
  if (!booking) return null;
  const params = {
    route: `${booking.departureDetails?.city} → ${booking.arrivalDetails?.city}`,
    date: booking.departureDetails?.date,
    time: fmtTime(booking.departureDetails?.time),
    bookingId: booking.pnr || String(booking._id).slice(-8).toUpperCase(),
  };
  return createNotification({
    userId: String(booking.customerId), category: "cancellation", type: "ticket_cancelled",
    params, priority: "high",
    payload: { bookingId: String(booking._id) },
    link: `/profile`, dedupKey: `ticket_cancelled_${booking._id}`,
    channels: ["inapp", "email", "push"],
  });
}

async function notifyRefundInitiated(booking, amount) {
  if (!booking) return null;
  const params = {
    route: `${booking.departureDetails?.city} → ${booking.arrivalDetails?.city}`,
    date: booking.departureDetails?.date,
    bookingId: booking.pnr || String(booking._id).slice(-8).toUpperCase(),
    amount,
  };
  return createNotification({
    userId: String(booking.customerId), category: "refund", type: "refund_initiated",
    params, priority: "normal",
    payload: { bookingId: String(booking._id), amount },
    link: `/profile`, dedupKey: `refund_initiated_${booking._id}`,
    channels: ["inapp", "email", "push"],
  });
}

async function notifyRefundSuccessful(booking, amount) {
  if (!booking) return null;
  const params = {
    route: `${booking.departureDetails?.city} → ${booking.arrivalDetails?.city}`,
    bookingId: booking.pnr || String(booking._id).slice(-8).toUpperCase(),
    amount,
  };
  return createNotification({
    userId: String(booking.customerId), category: "refund", type: "refund_successful",
    params, priority: "high",
    payload: { bookingId: String(booking._id), amount },
    link: `/profile`, dedupKey: `refund_successful_${booking._id}`,
    channels: ["inapp", "email", "push"],
  });
}

async function notifyRefundFailed(booking, reason) {
  if (!booking) return null;
  const params = {
    route: `${booking.departureDetails?.city} → ${booking.arrivalDetails?.city}`,
    bookingId: booking.pnr || String(booking._id).slice(-8).toUpperCase(),
    reason,
  };
  return createNotification({
    userId: String(booking.customerId), category: "refund", type: "refund_failed",
    params, priority: "critical",
    payload: { bookingId: String(booking._id), reason },
    link: `/profile`, dedupKey: `refund_failed_${booking._id}_${Date.now()}`,
    channels: ["inapp", "email", "push"],
  });
}

// -- Bus Updates --
async function notifyBusStatusChange({ busId, busName, kind, delayMinutes, date, newTime, route }) {
  const bookings = await Booking.find({ busId: String(busId) }).lean().exec();
  const targetBookings = date ? bookings.filter((b) => String(b.departureDetails?.date) === String(date)) : bookings;
  let created = 0;
  for (const booking of targetBookings) {
    const typeMap = { delayed: "bus_delayed", rescheduled: "bus_rescheduled", cancelled: "bus_cancelled" };
    const type = typeMap[kind] || "bus_delayed";
    const params = {
      busName: busName || `Bus ${busId}`,
      route: route || `${booking.departureDetails?.city} → ${booking.arrivalDetails?.city}`,
      date: date || booking.departureDetails?.date,
      delayMinutes: delayMinutes || 0,
      newTime: newTime || newDepartureTime(booking.departureDetails, delayMinutes || 0),
    };
    const dedupKey = `${type}_${booking._id}_${date || "all"}`;
    const already = await Notification.findOne({ userId: String(booking.customerId), dedupKey }).lean().exec();
    if (already) continue;
    const n = await createNotification({
      userId: String(booking.customerId), category: "bus", type, params,
      priority: kind === "cancelled" ? "critical" : "high",
      payload: { busId: String(busId), bookingId: String(booking._id), delayMinutes: delayMinutes || 0 },
      link: `/profile`, dedupKey,
      channels: ["inapp", "email", "push"],
    });
    if (n) created += 1;
  }
  return created;
}

async function notifyBoardingPointChanged({ busId, date, newBoardingPoint, route }) {
  const bookings = await Booking.find({ busId: String(busId) }).lean().exec();
  const target = date ? bookings.filter((b) => String(b.departureDetails?.date) === String(date)) : bookings;
  let created = 0;
  for (const booking of target) {
    const params = {
      route: route || `${booking.departureDetails?.city} → ${booking.arrivalDetails?.city}`,
      date: date || booking.departureDetails?.date,
      newBoardingPoint,
    };
    const dedupKey = `boarding_point_changed_${booking._id}_${date || "all"}`;
    const already = await Notification.findOne({ userId: String(booking.customerId), dedupKey }).lean().exec();
    if (already) continue;
    const n = await createNotification({
      userId: String(booking.customerId), category: "bus", type: "boarding_point_changed",
      params, priority: "high",
      payload: { busId: String(busId), bookingId: String(booking._id), newBoardingPoint },
      link: `/profile`, dedupKey,
      channels: ["inapp", "email", "push"],
    });
    if (n) created += 1;
  }
  return created;
}

// -- Account / Security --
async function notifyWelcome(customer) {
  if (!customer) return null;
  return createNotification({
    userId: String(customer._id), category: "account", type: "welcome",
    params: { name: customer.name || "" }, priority: "normal",
    payload: { email: customer.email },
    link: `/profile`, dedupKey: `welcome_${customer._id}`,
    channels: ["inapp", "email", "push"],
  });
}

async function notifyNewLogin(customer, { device, location } = {}) {
  if (!customer) return null;
  return createNotification({
    userId: String(customer._id), category: "security", type: "new_login",
    params: { device: device || "unknown device", location: location || "unknown location" },
    priority: "critical",
    payload: { device, location },
    link: `/profile`, dedupKey: `new_login_${customer._id}_${Date.now()}`,
    channels: ["inapp", "email", "push"],
  });
}

async function notifyPasswordChanged(customer) {
  if (!customer) return null;
  return createNotification({
    userId: String(customer._id), category: "security", type: "password_changed",
    params: {}, priority: "high", payload: {},
    link: `/profile`, dedupKey: `password_changed_${customer._id}_${Date.now()}`,
    channels: ["inapp", "email", "push"],
  });
}

async function notifyEmailChanged(customer, newEmail) {
  if (!customer) return null;
  return createNotification({
    userId: String(customer._id), category: "security", type: "email_changed",
    params: { newEmail }, priority: "high", payload: { newEmail },
    link: `/profile`, dedupKey: `email_changed_${customer._id}_${Date.now()}`,
    channels: ["inapp", "email", "push"],
  });
}

async function notifyPhoneChanged(customer, newPhone) {
  if (!customer) return null;
  return createNotification({
    userId: String(customer._id), category: "security", type: "phone_changed",
    params: { newPhone }, priority: "high", payload: { newPhone },
    link: `/profile`, dedupKey: `phone_changed_${customer._id}_${Date.now()}`,
    channels: ["inapp", "email", "push"],
  });
}

// -- Support --
async function notifySupportTicket(customer, ticketId) {
  if (!customer) return null;
  return createNotification({
    userId: String(customer._id), category: "support", type: "support_ticket_created",
    params: { ticketId }, priority: "normal", payload: { ticketId },
    link: `/support`, dedupKey: `support_created_${ticketId}`,
    channels: ["inapp", "email", "push"],
  });
}

async function notifySupportAgentReply(customer, ticketId) {
  if (!customer) return null;
  return createNotification({
    userId: String(customer._id), category: "support", type: "support_agent_reply",
    params: { ticketId }, priority: "normal", payload: { ticketId },
    link: `/support`, dedupKey: `support_reply_${ticketId}_${Date.now()}`,
    channels: ["inapp", "email", "push"],
  });
}

async function notifySupportTicketResolved(customer, ticketId) {
  if (!customer) return null;
  return createNotification({
    userId: String(customer._id), category: "support", type: "support_ticket_resolved",
    params: { ticketId }, priority: "normal", payload: { ticketId },
    link: `/support`, dedupKey: `support_resolved_${ticketId}`,
    channels: ["inapp", "push"],
  });
}

// -- Offers / Promotions --
async function getTargetUsers(segment, userIds) {
  if (segment === "all") {
    const customers = await Customer.find().lean().exec();
    return customers.map((c) => c._id.toString());
  }
  if (Array.isArray(userIds) && userIds.length) return userIds.filter(Boolean).map(String);
  return [];
}

async function sendOfferToUsers({ title, message, promoCode, segment, userIds }) {
  const targets = await getTargetUsers(segment, userIds);
  let created = 0;
  for (const userId of targets) {
    const n = await createNotification({
      userId, category: "offers", type: "offer",
      params: { offerTitle: title, promoCode: promoCode || "TED10" },
      priority: "normal",
      payload: { offerTitle: title, promoCode: promoCode || "TED10", rawMessage: message || "" },
      link: `/`, dedupKey: `offer_${promoCode || "TED10"}_${userId}_${Date.now()}`,
      channels: ["inapp", "push"],
    });
    if (n) created += 1;
  }
  return created;
}

async function sendCouponToUsers({ couponCode, discountText, segment, userIds }) {
  const targets = await getTargetUsers(segment, userIds);
  let created = 0;
  for (const userId of targets) {
    const n = await createNotification({
      userId, category: "offers", type: "coupon",
      params: { couponCode, discountText: discountText || "a special discount" },
      priority: "normal",
      payload: { couponCode, discountText: discountText || "a special discount" },
      link: `/`, dedupKey: `coupon_${couponCode}_${userId}_${Date.now()}`,
      channels: ["inapp", "push"],
    });
    if (n) created += 1;
  }
  return created;
}

// -- Community --
async function bridgeCommunityNotification({ userId, actorUserId, type, postId, commentId, message }) {
  if (!userId) return null;
  if (actorUserId && String(userId) === String(actorUserId)) return null;

  if (type === "verification_approved" || type === "system") {
    return createNotification({
      userId: String(userId), category: "account", type: "account",
      params: { detail: message || "Your TedBus account has been updated." },
      payload: { actorUserId, postId, commentId, communityType: type },
      link: "/community",
      dedupKey: `community_${type}_${postId || ""}_${commentId || ""}_${actorUserId || "system"}`,
      channels: ["inapp"],
    });
  }

  const actor = actorUserId ? await Customer.findById(actorUserId).lean().exec() : null;
  const actorName = actor ? actor.name || actor.email : "Someone";
  const clean = (m) => (typeof m === "string" ? m.replace(/\.+$/, "").trim() : "");
  let action = clean(message) || "interacted with your content";
  let communityType = "community_activity";
  if (type === "like") { action = clean(message) || "liked your post"; communityType = "community_like"; }
  else if (type === "comment") { action = clean(message) || "commented on your post"; communityType = "community_comment"; }
  else if (type === "reply") { action = clean(message) || "replied to a comment on your post"; communityType = "community_reply"; }
  else if (type === "follow") { action = clean(message) || "started following you"; }
  else if (type === "mention") { action = clean(message) || "mentioned you in a post/comment"; communityType = "community_mention"; }

  return createNotification({
    userId: String(userId), category: "community", type: communityType,
    params: { actorName, action, busName: "" },
    payload: { actorUserId, postId, commentId, communityType: type },
    link: postId ? `/community/post/${postId}` : "/community",
    dedupKey: `community_${type}_${postId || ""}_${commentId || ""}_${actorUserId || "system"}`,
    channels: ["inapp", "push"],
  });
}

// -- System --
async function notifyMaintenance({ userIds, maintenanceDate, detail }) {
  const targets = userIds && userIds.length ? userIds : (await Customer.find().lean().exec()).map((c) => String(c._id));
  let created = 0;
  for (const userId of targets) {
    const n = await createNotification({
      userId, category: "system", type: "maintenance",
      params: { maintenanceDate, detail }, priority: "normal",
      payload: { maintenanceDate, detail },
      link: `/`, dedupKey: `maintenance_${maintenanceDate || Date.now()}_${userId}`,
      channels: ["inapp", "email", "push"],
    });
    if (n) created += 1;
  }
  return created;
}

// -- Test Push --
async function sendTestPush(userId) {
  if (!userId) return { ok: false, delivered: 0, total: 0, failures: ["Missing user."] };
  const notif = await createNotification({
    userId: String(userId), category: "account", type: "account",
    params: { detail: "This is a test push notification from TedBus. Push is working end-to-end!" },
    priority: "normal", payload: { test: true },
    link: "/notifications", channels: ["inapp", "push"],
  });
  if (!notif) return { ok: false, delivered: 0, total: 0, failures: ["Test notification not created — check preferences."] };
  const saved = await Notification.findById(notif._id).lean().exec();
  const push = saved?.channels?.push;
  if (push?.status === "sent") {
    console.log(`[push] test push delivered to user ${userId}.`);
    return { ok: true, delivered: 1, total: 1, failures: [], message: "Test push delivered." };
  }
  return { ok: false, delivered: 0, total: 1, failures: [push?.error || `Push status: ${push?.status || "unknown"}`] };
}

// ======================== EXPORTS ========================

module.exports = {
  createNotification,
  retryChannel,
  retryFailedChannels,
  MAX_RETRY_ATTEMPTS,
  notifyBookingConfirmed,
  notifyBookingCancelled,
  notifyPaymentSuccessful,
  notifyPaymentFailed,
  notifyPaymentPending,
  sendTripReminders,
  sendJourneyReminders,
  notifyBoardingReminder,
  notifyJourneyCompleted,
  notifyTicketCancelled,
  notifyRefundInitiated,
  notifyRefundSuccessful,
  notifyRefundFailed,
  notifyBusStatusChange,
  notifyBoardingPointChanged,
  sendOfferToUsers,
  sendCouponToUsers,
  bridgeCommunityNotification,
  notifyWelcome,
  notifyNewLogin,
  notifyPasswordChanged,
  notifyEmailChanged,
  notifyPhoneChanged,
  notifySupportTicket,
  notifySupportAgentReply,
  notifySupportTicketResolved,
  notifyMaintenance,
  getOrCreatePreferences,
  translate,
  sendTestPush,
  LOCALES,
  CATEGORY_LABEL,
};
