const Review = require("../models/review");
const Booking = require("../models/booking");
const { tReq } = require("../services/i18n");

// GET /api/reviews/:busId — public: list visible reviews for a bus
exports.getReviews = async (req, res) => {
  try {
    const { busId } = req.params;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const [reviews, total, stats] = await Promise.all([
      Review.find({ busId, visible: true })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      Review.countDocuments({ busId, visible: true }).exec(),
      Review.aggregate([
        { $match: { busId: require("mongoose").Types.ObjectId.createFromHexString(busId), visible: true } },
        {
          $group: {
            _id: "$busId",
            avgRating: { $avg: "$rating" },
            totalReviews: { $sum: 1 },
            breakdown: {
              $push: "$rating",
            },
          },
        },
      ]).exec(),
    ]);

    const agg = stats[0] || { avgRating: 0, totalReviews: 0, breakdown: [] };
    const ratingBreakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const r of agg.breakdown) {
      ratingBreakdown[r] = (ratingBreakdown[r] || 0) + 1;
    }

    return res.json({
      reviews,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      stats: {
        avgRating: Math.round((agg.avgRating || 0) * 10) / 10,
        totalReviews: agg.totalReviews || 0,
        ratingBreakdown,
      },
    });
  } catch (error) {
    console.error("[review] getReviews error:", error.message);
    return res.status(500).json({ error: tReq(req, "review.errLoad") });
  }
};

// POST /api/reviews — authenticated: create a review (must have a verified booking)
exports.createReview = async (req, res) => {
  try {
    const { busId, rating, title, comment, bookingId } = req.body;
    if (!busId || !rating) {
      return res.status(400).json({ error: tReq(req, "review.fieldsRequired") });
    }
    const r = Math.round(Number(rating));
    if (r < 1 || r > 5) {
      return res.status(400).json({ error: tReq(req, "review.ratingRange") });
    }

    // Verify the user has a completed/confirmed booking for this bus
    const booking = await Booking.findOne({
      _id: bookingId,
      customerId: req.userId,
      "busId._id": busId,
      status: { $in: ["confirmed", "completed"] },
    }).exec();

    // If bookingId provided, validate it; if not, just check any booking exists
    if (bookingId && !booking) {
      return res.status(403).json({ error: tReq(req, "review.bookingRequired") });
    }

    // Check duplicate
    const existing = await Review.findOne({ busId, customerId: req.userId }).exec();
    if (existing) {
      return res.status(409).json({ error: tReq(req, "review.alreadyReviewed") });
    }

    const review = await Review.create({
      busId,
      customerId: req.userId,
      bookingId: booking ? booking._id : undefined,
      customerName: req.user && req.user.name ? req.user.name : "",
      title: String(title || "").slice(0, 120),
      rating: r,
      comment: String(comment || "").slice(0, 2000),
      photos: Array.isArray(req.body.photos) ? req.body.photos.slice(0, 5) : [],
    });

    return res.status(201).json({ review });
  } catch (error) {
    console.error("[review] createReview error:", error.message);
    if (error.code === 11000) {
      return res.status(409).json({ error: tReq(req, "review.alreadyReviewed") });
    }
    return res.status(500).json({ error: tReq(req, "review.errCreate") });
  }
};

// PUT /api/reviews/:id — authenticated: edit own review
exports.updateReview = async (req, res) => {
  try {
    const { id } = req.params;
    const review = await Review.findOne({ _id: id, customerId: req.userId }).exec();
    if (!review) {
      return res.status(404).json({ error: tReq(req, "review.notFound") });
    }

    const { rating, title, comment } = req.body;
    if (rating !== undefined) {
      const r = Math.round(Number(rating));
      if (r < 1 || r > 5) {
        return res.status(400).json({ error: tReq(req, "review.ratingRange") });
      }
      review.rating = r;
    }
    if (title !== undefined) review.title = String(title).slice(0, 120);
    if (comment !== undefined) review.comment = String(comment).slice(0, 2000);

    await review.save();
    return res.json({ review });
  } catch (error) {
    console.error("[review] updateReview error:", error.message);
    return res.status(500).json({ error: tReq(req, "review.errUpdate") });
  }
};

// DELETE /api/reviews/:id — authenticated: delete own review
exports.deleteReview = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Review.findOneAndDelete({ _id: id, customerId: req.userId }).exec();
    if (!deleted) {
      return res.status(404).json({ error: tReq(req, "review.notFound") });
    }
    return res.json({ message: tReq(req, "review.deleted") });
  } catch (error) {
    console.error("[review] deleteReview error:", error.message);
    return res.status(500).json({ error: tReq(req, "review.errDelete") });
  }
};

// GET /api/reviews/user/me — authenticated: list current user's reviews
exports.myReviews = async (req, res) => {
  try {
    const reviews = await Review.find({ customerId: req.userId })
      .sort({ createdAt: -1 })
      .populate("busId", "busname busnumber busoperator")
      .lean()
      .exec();
    return res.json({ reviews });
  } catch (error) {
    console.error("[review] myReviews error:", error.message);
    return res.status(500).json({ error: tReq(req, "review.errLoad") });
  }
};
