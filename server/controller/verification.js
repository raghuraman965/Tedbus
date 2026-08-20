const VerificationRequest = require("../models/verificationRequest");
const Customer = require("../models/customer");

// ======================== USER ENDPOINTS ========================

// POST /verification/request — submit a verification request
exports.submitRequest = async (req, res) => {
  try {
    const userId = req.userId;
    const { fullName, phone, dateOfBirth, gender, address, idProofType, idProofNumber, reason } = req.body;

    if (!fullName || !phone || !dateOfBirth) {
      return res.status(400).json({ error: "Full name, phone, and date of birth are required." });
    }

    // Check for existing pending request
    const existing = await VerificationRequest.findOne({
      customerId: userId,
      status: "pending",
    }).exec();

    if (existing) {
      return res.status(409).json({ error: "You already have a pending verification request." });
    }

    const request = new VerificationRequest({
      customerId: userId,
      fullName,
      phone,
      dateOfBirth,
      gender: gender || "",
      address: address || "",
      idProofType: idProofType || "aadhaar",
      idProofNumber: idProofNumber || "",
      reason: reason || "",
      status: "pending",
    });

    await request.save();
    res.status(201).json({ success: true, message: "Verification request submitted.", requestId: request._id });
  } catch (err) {
    console.error("[verification] submitRequest error:", err);
    res.status(500).json({ error: "Failed to submit verification request." });
  }
};

// GET /verification/status — get current user's verification request status
exports.getRequestStatus = async (req, res) => {
  try {
    const userId = req.userId;

    const request = await VerificationRequest.findOne({ customerId: userId })
      .sort({ submittedAt: -1 })
      .lean()
      .exec();

    if (!request) {
      return res.json({ hasRequest: false, status: null });
    }

    res.json({
      hasRequest: true,
      status: request.status,
      adminNote: request.adminNote || "",
      submittedAt: request.submittedAt,
      reviewedAt: request.reviewedAt,
    });
  } catch (err) {
    console.error("[verification] getRequestStatus error:", err);
    res.status(500).json({ error: "Failed to fetch verification status." });
  }
};

// ======================== ADMIN ENDPOINTS ========================

// GET /admin/verification-requests — list all verification requests
exports.adminListRequests = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status) filter.status = status;

    const total = await VerificationRequest.countDocuments(filter).exec();
    const requests = await VerificationRequest.find(filter)
      .sort({ submittedAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .populate("customerId", "name email profilePicture")
      .lean()
      .exec();

    res.json({ requests, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error("[verification] adminListRequests error:", err);
    res.status(500).json({ error: "Failed to fetch verification requests." });
  }
};

// PUT /admin/verification-requests/:id — approve or reject a request
exports.adminReviewRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, adminNote } = req.body;

    if (!action || !["approved", "rejected"].includes(action)) {
      return res.status(400).json({ error: "Action must be 'approved' or 'rejected'." });
    }

    const request = await VerificationRequest.findById(id).exec();
    if (!request) {
      return res.status(404).json({ error: "Verification request not found." });
    }

    if (request.status !== "pending") {
      return res.status(400).json({ error: "This request has already been reviewed." });
    }

    request.status = action;
    request.adminNote = adminNote || "";
    request.reviewedBy = req.userId;
    request.reviewedAt = new Date();
    await request.save();

    // If approved, update the customer
    if (action === "approved") {
      await Customer.findByIdAndUpdate(request.customerId, {
        isVerified: true,
        verificationBadge: true,
      }).exec();
    }

    res.json({ success: true, message: `Verification request ${action}.` });
  } catch (err) {
    console.error("[verification] adminReviewRequest error:", err);
    res.status(500).json({ error: "Failed to review verification request." });
  }
};
