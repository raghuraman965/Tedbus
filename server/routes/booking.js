const express=require("express")
const router=express.Router();
const bookingController=require("../controller/booking")
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
router.post("/booking/verify-payment", requireAuth, bookingController.verifyPayment);
router.post("/booking", requireAuth, bookingController.addbooking);
router.post("/booking/segment", requireAuth, bookingController.addSegmentBooking);
router.get("/booking/ticket/:pnr/pdf", requireAuth, bookingController.downloadTicketPdf);
router.post("/booking/ticket/:pnr/email", requireAuth, bookingController.emailTicket);
router.get("/booking/ticket/:pnr", requireAuth, bookingController.getTicketByPnr);
router.get("/booking/:id", requireAuth, bookingController.getBooking);
router.delete("/booking/:id", requireAuth, bookingController.cancelBooking);
module.exports=router;
