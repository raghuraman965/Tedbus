const express = require("express");
const router = express.Router();
const {
  getPaymentSettings,
  updatePaymentSettings,
} = require("../controller/paymentSettings");

router.get("/payment/settings", getPaymentSettings);
router.put("/payment/settings", updatePaymentSettings);

module.exports = router;
