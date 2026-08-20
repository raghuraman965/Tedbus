const Offer = require("../models/offer");

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function pickFields(obj, allowed) {
  const out = {};
  for (const k of allowed) {
    if (obj[k] !== undefined) out[k] = obj[k];
  }
  return out;
}

exports.listOffers = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const { search = "", isActive } = req.query;
    const filter = {};
    if (search) {
      filter.$or = [
        { title: { $regex: escapeRegex(search), $options: "i" } },
        { code: { $regex: escapeRegex(search), $options: "i" } },
      ];
    }
    if (isActive === "true") filter.isActive = true;
    else if (isActive === "false") filter.isActive = false;

    const [total, items] = await Promise.all([
      Offer.countDocuments(filter),
      Offer.find(filter)
        .populate("applicableRoutes", "departureLocation.name arrivalLocation.name")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
    ]);
    res.json({ ok: true, data: { items, total, page, limit, hasMore: page * limit < total } });
  } catch (err) {
    console.error("listOffers error:", err);
    res.status(500).json({ ok: false, message: "Could not load offers." });
  }
};

exports.getOffer = async (req, res) => {
  try {
    const offer = await Offer.findById(req.params.id)
      .populate("applicableRoutes", "departureLocation.name arrivalLocation.name")
      .lean()
      .exec();
    if (!offer) return res.status(404).json({ ok: false, message: "Offer not found." });
    res.json({ ok: true, data: { offer } });
  } catch (err) {
    res.status(500).json({ ok: false, message: "Could not load offer." });
  }
};

exports.createOffer = async (req, res) => {
  try {
    const { title, code, validFrom, validTo } = req.body;
    if (!title || !code || !validFrom || !validTo) {
      return res.status(400).json({ ok: false, message: "title, code, validFrom, and validTo are required." });
    }
    const offer = await Offer.create({ ...pickFields(req.body, ["title","code","description","discountType","discountValue","validFrom","validTo","isActive","minAmount","maxUses"]), code: code.toUpperCase().trim() });
    res.status(201).json({ ok: true, data: { offer } });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ ok: false, message: "An offer with this code already exists." });
    }
    res.status(400).json({ ok: false, message: "Could not create offer." });
  }
};

exports.updateOffer = async (req, res) => {
  try {
    if (req.body.code) req.body.code = req.body.code.toUpperCase().trim();
    const offer = await Offer.findByIdAndUpdate(
      req.params.id,
      { $set: pickFields(req.body, ["title","code","description","discountType","discountValue","validFrom","validTo","isActive","minAmount","maxUses"]) },
      { new: true, runValidators: true }
    ).exec();
    if (!offer) return res.status(404).json({ ok: false, message: "Offer not found." });
    res.json({ ok: true, data: { offer } });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ ok: false, message: "An offer with this code already exists." });
    }
    res.status(400).json({ ok: false, message: "Could not update offer." });
  }
};

exports.deleteOffer = async (req, res) => {
  try {
    const offer = await Offer.findByIdAndDelete(req.params.id).lean();
    if (!offer) return res.status(404).json({ ok: false, message: "Offer not found." });
    res.json({ ok: true, data: { deleted: true } });
  } catch (err) {
    res.status(500).json({ ok: false, message: "Could not delete offer." });
  }
};

exports.toggleOffer = async (req, res) => {
  try {
    const offer = await Offer.findById(req.params.id).exec();
    if (!offer) return res.status(404).json({ ok: false, message: "Offer not found." });
    offer.isActive = !offer.isActive;
    await offer.save();
    res.json({ ok: true, data: { offer: offer.toObject() } });
  } catch (err) {
    res.status(500).json({ ok: false, message: "Could not toggle offer status." });
  }
};
