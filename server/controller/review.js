const mongoose = require("mongoose");
const Review = require("../models/review");
const Booking = require("../models/booking");
const Bus = require("../models/bus");
const Route = require("../models/route");
const Customer = require("../models/customer");
const { tReq } = require("../services/i18n");
const {
  REVIEW_LIMITS,
  EDIT_WINDOW_HOURS,
  REPORT_AUTO_HIDE_THRESHOLD,
  TRUSTED_REVIEWER_HELPFUL_THRESHOLD,
  isValidRating,
  isJourneyCompleted,
  checkReviewEligibility,
  isAccountVerifiedForReviews,
  getRouteRatingStats,
  getBusRatingStats,
  getUserHelpfulScore,
} = require("../services/reviewService");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toObjectId(id) {
  try {
    return id ? new mongoose.Types.ObjectId(String(id)) : null;
  } catch (e) {
    return null;
  }
}

/**
 * Badge map for reviewers on a page: { customerId -> { isVerified, trusted,
 * helpfulScore } }. Trusted = accumulated helpful votes across the author's
 * visible reviews reach TRUSTED_REVIEWER_HELPFUL_THRESHOLD.
 */
async function buildReviewerBadges(customerIds) {
  const ids = (customerIds || []).map(toObjectId).filter(Boolean);
  const map = {};
  if (!ids.length) return map;

  const [customers, helpfulRows] = await Promise.all([
    Customer.find({ _id: { $in: ids } })
      .select("name profilePicture isVerified")
      .lean()
      .exec(),
    Review.aggregate([
      { $match: { customerId: { $in: ids }, status: "visible" } },
      { $project: { customerId: 1, score: { $size: { $ifNull: ["$helpfulVotes", []] } } } },
      { $group: { _id: "$customerId", total: { $sum: "$score" } } },
    ]).exec(),
  ]);

  const helpfulMap = {};
  for (const row of helpfulRows) helpfulMap[String(row._id)] = row.total || 0;

  for (const c of customers) {
    const score = helpfulMap[String(c._id)] || 0;
    map[String(c._id)] = {
      isVerified: c.isVerified === true,
      trustedReviewer: score >= TRUSTED_REVIEWER_HELPFUL_THRESHOLD,
      helpfulScore: score,
    };
  }
  return map;
}

/** Shape a lean review doc for public consumption. */
function shapePublicReview(r, badges) {
  const authorId = r.customerId && typeof r.customerId === "object" ? String(r.customerId._id) : String(r.customerId);
  const badge = (badges && badges[authorId]) || {};
  const authorName =
    r.customerName ||
    (r.customerId && typeof r.customerId === "object" ? r.customerId.name : "") ||
    "TedBus Traveller";
  return {
    _id: String(r._id),
    routeId: r.routeId ? String(r.routeId._id || r.routeId) : null,
    busId: r.busId ? String(r.busId._id || r.busId) : null,
    bookingId: String(r.bookingId),
    journeyDate: r.journeyDate || "",
    rating: r.rating,
    title: r.title || "",
    comment: r.comment || "",
    photos: r.photos || [],
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    isEdited: !!r.isEdited,
    editedAt: r.editedAt || null,
    helpfulCount: Array.isArray(r.helpfulVotes) ? r.helpfulVotes.length : 0,
    reportCount: Array.isArray(r.reports) ? r.reports.length : 0,
    status: r.status,
    author: {
      name: authorName,
      photo: r.customerPhoto || (r.customerId && typeof r.customerId === "object" ? r.customerId.profilePicture : "") || "",
      isVerified: !!badge.isVerified,
      trustedReviewer: !!badge.trustedReviewer,
    },
  };
}

function viewerCanSeeModeration(user, review) {
  return user && user.isAdmin === true;
}

// ---------------------------------------------------------------------------
// Public listing endpoints
// ---------------------------------------------------------------------------

// GET /api/reviews/route/:routeId — public: visible reviews + stats for a route
exports.getRouteReviews = async (req, res) => {
  try {
    const { routeId } = req.params;
    if (!toObjectId(routeId)) {
      return res.status(400).json({ error: tReq(req, "review.notFound") });
    }
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));
    const skip = (page - 1) * limit;

    const [reviews, total, stats] = await Promise.all([
      Review.find({ routeId, status: "visible" })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("customerId", "name profilePicture isVerified")
        .lean()
        .exec(),
      Review.countDocuments({ routeId, status: "visible" }).exec(),
      getRouteRatingStats(routeId),
    ]);

    const badges = await buildReviewerBadges(reviews.map((r) => r.customerId));
    const shaped = reviews.map((r) => shapePublicReview(r, badges));

    // Viewer context (optional auth): has this user already reviewed /
    // voted / reported here?
    let viewer = null;
    if (req.userId) {
      const myVoteRows = await Review.find(
        { routeId, helpfulVotes: toObjectId(req.userId) },
        "_id"
      ).lean().exec();
      const mine = await Review.findOne({ routeId, customerId: req.userId })
        .sort({ createdAt: -1 })
        .lean()
        .exec();
      viewer = {
        votedReviewIds: myVoteRows.map((r) => String(r._id)),
        myReviewId: mine ? String(mine._id) : null,
      };
    }

    return res.json({
      reviews: shaped,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      stats,
      viewer,
    });
  } catch (error) {
    console.error("[review] getRouteReviews error:", error.message);
    return res.status(500).json({ error: tReq(req, "review.errLoad") });
  }
};

// GET /api/reviews/bus/:busId (and legacy GET /api/reviews/:busId)
exports.getBusReviews = async (req, res) => {
  try {
    const { busId } = req.params;
    if (!toObjectId(busId)) {
      return res.status(400).json({ error: tReq(req, "review.notFound") });
    }
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));
    const skip = (page - 1) * limit;

    const [reviews, total, stats] = await Promise.all([
      Review.find({ busId, status: "visible" })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("customerId", "name profilePicture isVerified")
        .lean()
        .exec(),
      Review.countDocuments({ busId, status: "visible" }).exec(),
      getBusRatingStats(busId),
    ]);

    const badges = await buildReviewerBadges(reviews.map((r) => r.customerId));
    const shaped = reviews.map((r) => shapePublicReview(r, badges));

    // Viewer context (optional auth), same contract as getRouteReviews.
    let viewer = null;
    if (req.userId) {
      const myVoteRows = await Review.find(
        { busId, helpfulVotes: toObjectId(req.userId) },
        "_id"
      ).lean().exec();
      const mine = await Review.findOne({ busId, customerId: req.userId })
        .sort({ createdAt: -1 })
        .lean()
        .exec();
      viewer = {
        votedReviewIds: myVoteRows.map((r) => String(r._id)),
        myReviewId: mine ? String(mine._id) : null,
      };
    }

    return res.json({
      reviews: shaped,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      stats,
      viewer,
    });
  } catch (error) {
    console.error("[review] getBusReviews error:", error.message);
    return res.status(500).json({ error: tReq(req, "review.errLoad") });
  }
};

// ---------------------------------------------------------------------------
// Eligibility
// ---------------------------------------------------------------------------

// GET /api/reviews/eligibility?bookingId=...&routeId=...&busId=...
exports.checkEligibility = async (req, res) => {
  try {
    const { bookingId, routeId, busId } = req.query;
    if (!bookingId) {
      return res.status(400).json({
        error: tReq(req, "review.bookingRequired"),
        reason: "booking_required",
      });
    }

    const accountOk = isAccountVerifiedForReviews(req.user);
    if (!accountOk) {
      return res.json({ eligible: false, reason: "unverified_account" });
    }

    const result = await checkReviewEligibility({
      userId: req.userId,
      routeId: routeId || null,
      busId: busId || null,
      bookingId,
    });

    const payload = { eligible: result.eligible, reason: result.reason };
    if (result.booking) {
      payload.booking = {
        _id: String(result.booking._id),
        pnr: result.booking.pnr || "",
        journeyDate: (result.booking.departureDetails && result.booking.departureDetails.date) || "",
        arrivalDate: (result.booking.arrivalDetails && result.booking.arrivalDetails.date) || "",
      };
      payload.routeId = result.bookingRouteId;
      payload.busId = String(result.booking.busId);
    }
    return res.json(payload);
  } catch (error) {
    console.error("[review] checkEligibility error:", error.message);
    return res.status(500).json({ error: tReq(req, "review.errLoad") });
  }
};

// ---------------------------------------------------------------------------
// Create / edit / delete
// ---------------------------------------------------------------------------

// POST /api/reviews — authenticated: create review for a completed journey
exports.createReview = async (req, res) => {
  try {
    const { bookingId, rating, title, comment, photos } = req.body;

    if (!bookingId) {
      return res.status(400).json({
        error: tReq(req, "review.bookingRequired"),
        reason: "booking_required",
      });
    }
    if (!isValidRating(rating)) {
      return res.status(400).json({
        error: Number.isInteger(Number(rating))
          ? tReq(req, "review.ratingRange")
          : tReq(req, "review.ratingInteger"),
        reason: "invalid_rating",
      });
    }

    const text = String(comment || "").trim();
    if (text.length < REVIEW_LIMITS.MIN_CHARS) {
      return res.status(400).json({
        error: tReq(req, "review.commentTooShort").replace("{min}", String(REVIEW_LIMITS.MIN_CHARS)),
        reason: "comment_too_short",
      });
    }
    if (text.length > REVIEW_LIMITS.MAX_CHARS) {
      return res.status(400).json({
        error: tReq(req, "review.commentTooLong"),
        reason: "comment_too_long",
      });
    }

    // Account must be verified & active.
    if (!isAccountVerifiedForReviews(req.user)) {
      return res.status(403).json({
        error: tReq(req, "review.unverifiedAccount"),
        reason: "unverified_account",
      });
    }

    // Full journey-based eligibility (ownership, payment, completion, route).
    const eligibility = await checkReviewEligibility({
      userId: req.userId,
      routeId: req.body.routeId || null,
      busId: req.body.busId || null,
      bookingId,
    });
    if (!eligibility.eligible) {
      const keyByReason = {
        auth_required: "errors.auth.required",
        booking_not_found: "review.notFound",
        booking_not_owned: "review.bookingNotOwned",
        payment_not_verified: "review.paymentNotVerified",
        journey_not_completed: "review.journeyNotCompleted",
        route_mismatch: "review.routeMismatch",
        already_reviewed: "review.alreadyReviewed",
      };
      const key = keyByReason[eligibility.reason] || "review.bookingRequired";
      const status = eligibility.reason === "already_reviewed" ? 409 : 403;
      return res.status(status).json({ error: tReq(req, key), reason: eligibility.reason });
    }

    const booking = eligibility.booking;
    const photoList = Array.isArray(photos)
      ? photos.filter((p) => typeof p === "string" && p.trim()).slice(0, 5)
      : [];

    try {
      const review = await Review.create({
        routeId: eligibility.bookingRouteId,
        busId: booking.busId,
        customerId: req.userId,
        bookingId: booking._id,
        journeyDate: (booking.departureDetails && booking.departureDetails.date) || "",
        customerName: (req.user && req.user.name) || "",
        customerPhoto: (req.user && req.user.profilePicture) || "",
        title: String(title || "").trim().slice(0, REVIEW_LIMITS.TITLE_MAX_CHARS),
        rating,
        comment: text.slice(0, REVIEW_LIMITS.MAX_CHARS),
        photos: photoList,
        status: "visible",
        visible: true,
      });

      const stats = await getRouteRatingStats(eligibility.bookingRouteId);
      return res.status(201).json({
        review: shapePublicReview(review.toObject ? review.toObject() : review, {
          [String(req.userId)]: { isVerified: true, trustedReviewer: false, helpfulScore: 0 },
        }),
        stats,
      });
    } catch (err) {
      if (err && err.code === 11000) {
        // Unique index on bookingId — race-safe duplicate guard.
        return res.status(409).json({
          error: tReq(req, "review.alreadyReviewed"),
          reason: "already_reviewed",
        });
      }
      throw err;
    }
  } catch (error) {
    console.error("[review] createReview error:", error.message);
    return res.status(500).json({ error: tReq(req, "review.errCreate") });
  }
};

// PUT /api/reviews/:id — authenticated: edit own review within 24h window
exports.updateReview = async (req, res) => {
  try {
    const { id } = req.params;
    const review = await Review.findOne({ _id: id, customerId: req.userId }).exec();
    if (!review) {
      return res.status(404).json({ error: tReq(req, "review.notFound") });
    }
    if (review.status === "removed") {
      return res.status(403).json({ error: tReq(req, "review.notFound"), reason: "removed" });
    }

    const hoursSince = (Date.now() - new Date(review.createdAt).getTime()) / 3600000;
    if (hoursSince > EDIT_WINDOW_HOURS) {
      return res.status(403).json({
        error: tReq(req, "review.editWindowExpired"),
        reason: "edit_window_expired",
      });
    }

    const { rating, title, comment } = req.body;
    if (rating !== undefined) {
      if (!isValidRating(rating)) {
        return res.status(400).json({
          error: Number.isInteger(Number(rating))
            ? tReq(req, "review.ratingRange")
            : tReq(req, "review.ratingInteger"),
          reason: "invalid_rating",
        });
      }
      review.rating = rating;
    }
    if (title !== undefined) {
      review.title = String(title).trim().slice(0, REVIEW_LIMITS.TITLE_MAX_CHARS);
    }
    if (comment !== undefined) {
      const text = String(comment).trim();
      if (text.length < REVIEW_LIMITS.MIN_CHARS) {
        return res.status(400).json({
          error: tReq(req, "review.commentTooShort").replace("{min}", String(REVIEW_LIMITS.MIN_CHARS)),
          reason: "comment_too_short",
        });
      }
      review.comment = text.slice(0, REVIEW_LIMITS.MAX_CHARS);
    }

    review.isEdited = true;
    review.editedAt = new Date();
    await review.save();

    const stats = await getRouteRatingStats(review.routeId);
    return res.json({ review: shapePublicReview(review.toObject(), {}), stats });
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
    const stats = deleted.routeId ? await getRouteRatingStats(deleted.routeId) : null;
    return res.json({ message: tReq(req, "review.deleted"), stats });
  } catch (error) {
    console.error("[review] deleteReview error:", error.message);
    return res.status(500).json({ error: tReq(req, "review.errDelete") });
  }
};

// ---------------------------------------------------------------------------
// Community moderation: reports & helpful votes
// ---------------------------------------------------------------------------

// POST /api/reviews/:id/report — authenticated: report a review
exports.reportReview = async (req, res) => {
  try {
    const { id } = req.params;
    const reason = String(req.body.reason || "other");
    if (!Review.REPORT_REASONS.includes(reason)) {
      return res.status(400).json({
        error: tReq(req, "review.reportReasonInvalid"),
        reason: "invalid_report_reason",
      });
    }

    const review = await Review.findById(id).exec();
    if (!review) {
      return res.status(404).json({ error: tReq(req, "review.notFound") });
    }
    if (String(review.customerId) === String(req.userId)) {
      return res.status(400).json({
        error: tReq(req, "review.cannotReportOwn"),
        reason: "own_review",
      });
    }
    if (review.reports.some((r) => String(r.customerId) === String(req.userId))) {
      return res.status(409).json({
        error: tReq(req, "review.alreadyReported"),
        reason: "already_reported",
      });
    }

    review.reports.push({ customerId: req.userId, reason, createdAt: new Date() });

    // Auto-hide once unique reports reach the configured threshold.
    if (
      review.status === "visible" &&
      review.reports.length >= REPORT_AUTO_HIDE_THRESHOLD
    ) {
      review.status = "hidden";
      review.visible = false;
      review.moderatedAt = new Date();
      review.moderationReason = "auto_reports";
    }

    await review.save();
    return res.json({
      message: tReq(req, "review.reported"),
      reportCount: review.reports.length,
      hidden: review.status !== "visible",
    });
  } catch (error) {
    console.error("[review] reportReview error:", error.message);
    return res.status(500).json({ error: tReq(req, "review.errUpdate") });
  }
};

// POST /api/reviews/:id/helpful — authenticated: toggle helpful vote
exports.toggleHelpful = async (req, res) => {
  try {
    const { id } = req.params;
    const review = await Review.findById(id).exec();
    if (!review) {
      return res.status(404).json({ error: tReq(req, "review.notFound") });
    }
    if (String(review.customerId) === String(req.userId)) {
      return res.status(400).json({
        error: tReq(req, "review.cannotHelpfulOwn"),
        reason: "own_review",
      });
    }

    const uid = toObjectId(req.userId);
    const idx = review.helpfulVotes.findIndex((v) => String(v) === String(uid));
    if (idx >= 0) {
      review.helpfulVotes.splice(idx, 1);
    } else {
      review.helpfulVotes.push(uid);
    }
    await review.save();

    // Keep the author's trusted-reviewer signal fresh.
    const authorTrusted = await isAuthorTrusted(review.customerId);

    return res.json({
      helpfulCount: review.helpfulVotes.length,
      voted: idx < 0,
      authorTrustedReviewer: authorTrusted,
    });
  } catch (error) {
    console.error("[review] toggleHelpful error:", error.message);
    return res.status(500).json({ error: tReq(req, "review.errUpdate") });
  }
};

async function isAuthorTrusted(customerId) {
  const score = await getUserHelpfulScore(customerId);
  return score >= TRUSTED_REVIEWER_HELPFUL_THRESHOLD;
}

// ---------------------------------------------------------------------------
// My reviews
// ---------------------------------------------------------------------------

// GET /api/reviews/user/me — authenticated: current user's reviews
exports.myReviews = async (req, res) => {
  try {
    const reviews = await Review.find({ customerId: req.userId })
      .sort({ createdAt: -1 })
      .populate("busId", "busname busnumber operatorName")
      .populate("routeId", "source destination")
      .lean()
      .exec();

    const helpfulScore = await getUserHelpfulScore(req.userId);

    return res.json({
      reviews: reviews.map((r) => ({
        ...shapePublicReview(r, {}),
        bus:
          r.busId && typeof r.busId === "object"
            ? {
                _id: String(r.busId._id),
                name: r.busId.busname || r.busId.operatorName || "",
                number: r.busId.busnumber || "",
              }
            : null,
        route:
          r.routeId && typeof r.routeId === "object"
            ? {
                _id: String(r.routeId._id),
                source: r.routeId.source || "",
                destination: r.routeId.destination || "",
              }
            : null,
        canEdit:
          (Date.now() - new Date(r.createdAt).getTime()) / 3600000 <= EDIT_WINDOW_HOURS &&
          r.status !== "removed",
      })),
      helpfulScore,
      trustedReviewer: helpfulScore >= TRUSTED_REVIEWER_HELPFUL_THRESHOLD,
    });
  } catch (error) {
    console.error("[review] myReviews error:", error.message);
    return res.status(500).json({ error: tReq(req, "review.errLoad") });
  }
};
