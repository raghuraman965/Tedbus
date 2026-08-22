const express=require("express")
const router=express.Router();
const bookingController=require("../controller/booking")
const paymentController=require("../controller/payment")
const { requireAuth } = require("../middleware/auth");

// Guest-facing, public endpoints. Guests may search buses and inspect the
// live seat map for any route — no account is required to LOOK.
router.post("/booking/verify-ticket", bookingController.verifyTicket);
router.post("/booking/validate-seats", bookingController.validateSeats);

// Segment-aware fare calculation (public — no auth needed to view fare)
router.post("/booking/calculate-fare", bookingController.calculateFare);

// Everything that commits money or writes booking state requires a logged-in
// user. The middleware sets req.userId from the JWT; controllers no longer
// trust a customerId sent in the request body, so a guest (or a malicious
// caller) cannot create a payment attempt or booking as an arbitrary user.
//
// Razorpay flow: /payment/order prices the booking server-side and opens a
// gateway order; /payment/confirm verifies the gateway signature and only then
// marks the attempt verified. Booking creation consumes that attempt.
router.post("/booking/payment/order", requireAuth, paymentController.createOrder);
router.post("/booking/payment/confirm", requireAuth, paymentController.confirmPayment);

// Lock-on-proceed: a 10-minute hold is taken BEFORE payment, and the fare
// quote returned here is the single source of truth the UI may display.
router.post("/booking/seats/lock", requireAuth, bookingController.lockSeats);
router.post("/booking/seats/release", requireAuth, bookingController.releaseSeatLock);

// The ONE authoritative booking creation endpoint (paymentReference + holdId).
router.post("/booking", requireAuth, bookingController.addbooking);
router.get("/booking/ticket/:pnr/pdf", requireAuth, bookingController.downloadTicketPdf);
router.post("/booking/ticket/:pnr/email", requireAuth, bookingController.emailTicket);
router.get("/booking/ticket/:pnr", requireAuth, bookingController.getTicketByPnr);
// Live refund preview — must be declared before GET /booking/:id.
router.get("/booking/refund-quote/:id", requireAuth, bookingController.refundQuote);
router.get("/booking/:id", requireAuth, bookingController.getBooking);
router.delete("/booking/:id", requireAuth, bookingController.cancelBooking);
module.exports=router;
