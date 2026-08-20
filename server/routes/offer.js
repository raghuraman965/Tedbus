const express = require("express");
const router = express.Router();
const { requireAdminAuth } = require("../middleware/adminAuth");
const offer = require("../controller/offer");

router.get("/admin/offers", requireAdminAuth, offer.listOffers);
router.get("/admin/offers/:id", requireAdminAuth, offer.getOffer);
router.post("/admin/offers", requireAdminAuth, offer.createOffer);
router.put("/admin/offers/:id", requireAdminAuth, offer.updateOffer);
router.delete("/admin/offers/:id", requireAdminAuth, offer.deleteOffer);
router.put("/admin/offers/:id/toggle", requireAdminAuth, offer.toggleOffer);

module.exports = router;
