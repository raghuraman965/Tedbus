const mongoose = require("mongoose");
const Customer = require("../models/customer");
const Bus = require("../models/bus");
const Route = require("../models/route");
const Booking = require("../models/booking");
const PaymentAttempt = require("../models/paymentAttempt");
const Driver = require("../models/driver");
const PaymentSettings = require("../models/paymentSettings");
const CommunityPost = require("../models/communityPost");
const CommunityComment = require("../models/communityComment");
const CommunityReport = require("../models/communityReport");
const ModerationLog = require("../models/moderationLog");
const Notification = require("../models/notification");
const Review = require("../models/review");
const Offer = require("../models/offer");
const paymentCtrl = require("./paymentSettings");
const notificationCtrl = require("./notification");

const { ObjectId } = mongoose.Types;

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

function parsePage(req) {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  return { page, limit };
}

function parseDateRange(req) {
  const { from, to, range } = req.query;
  let start, end;
  const now = new Date();
  end = to ? new Date(to + "T23:59:59.999Z") : now;
  if (from) {
    start = new Date(from + "T00:00:00.000Z");
  } else if (range) {
    start = new Date(now);
    switch (range) {
      case "today":
        start.setHours(0, 0, 0, 0);
        break;
      case "yesterday":
        start.setDate(start.getDate() - 1);
        start.setHours(0, 0, 0, 0);
        end = new Date(start);
        end.setHours(23, 59, 59, 999);
        break;
      case "7d":
        start.setDate(start.getDate() - 6);
        start.setHours(0, 0, 0, 0);
        break;
      case "30d":
        start.setDate(start.getDate() - 29);
        start.setHours(0, 0, 0, 0);
        break;
      case "month":
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      default:
        start.setHours(0, 0, 0, 0);
    }
  } else {
    start = new Date(0);
  }
  return { start, end };
}

// ---------------- Dashboard ----------------

exports.getDashboardStats = async (req, res) => {
  try {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 6);
    weekAgo.setHours(0, 0, 0, 0);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const activeRevenueStatuses = ["ticket_confirmed", "payment_verified", "completed"];

    const [
      customers,
      totalBuses,
      totalRoutes,
      totalDrivers,
      totalBookings,
      confirmedBookings,
      cancelledBookings,
      pendingBookings,
      completedBookings,
      failedBookings,
      todayBookings,
      totalRevenueAgg,
      todayRevenueAgg,
      weekRevenueAgg,
      monthRevenueAgg,
      cancelledRevenueAgg,
      pendingReports,
      totalPosts,
      totalPayments,
      successfulPayments,
      failedPayments,
      pendingPayments,
      activeOffers,
    ] = await Promise.all([
      Customer.countDocuments(),
      Bus.countDocuments(),
      Route.countDocuments(),
      Driver.countDocuments(),
      Booking.countDocuments(),
      Booking.countDocuments({ status: { $in: ["ticket_confirmed", "payment_verified"] } }),
      Booking.countDocuments({ status: "cancelled" }),
      Booking.countDocuments({ status: "pending_payment" }),
      Booking.countDocuments({ status: "completed" }),
      Booking.countDocuments({ status: "failed" }),
      Booking.countDocuments({ createdAt: { $gte: todayStart } }),
      Booking.aggregate([
        { $match: { status: { $in: activeRevenueStatuses } } },
        { $group: { _id: null, total: { $sum: "$fare" } } },
      ]),
      Booking.aggregate([
        { $match: { status: { $in: activeRevenueStatuses }, createdAt: { $gte: todayStart } } },
        { $group: { _id: null, total: { $sum: "$fare" } } },
      ]),
      Booking.aggregate([
        { $match: { status: { $in: activeRevenueStatuses }, createdAt: { $gte: weekAgo } } },
        { $group: { _id: null, total: { $sum: "$fare" } } },
      ]),
      Booking.aggregate([
        { $match: { status: { $in: activeRevenueStatuses }, createdAt: { $gte: monthStart } } },
        { $group: { _id: null, total: { $sum: "$fare" } } },
      ]),
      Booking.aggregate([
        { $match: { status: "cancelled" } },
        { $group: { _id: null, total: { $sum: "$fare" } } },
      ]),
      CommunityReport.countDocuments({ status: "pending" }),
      CommunityPost.countDocuments(),
      PaymentAttempt.countDocuments(),
      PaymentAttempt.countDocuments({ status: "verified" }),
      PaymentAttempt.countDocuments({ status: "failed" }),
      PaymentAttempt.countDocuments({ status: "pending" }),
      Offer.countDocuments({ isActive: true }),
    ]);

    const upcomingJourneys = await Booking.countDocuments({
      status: { $in: ["confirmed", "upcoming", "ticket_confirmed", "payment_verified"] },
    });

    const recentBookings = await Booking.find()
      .sort({ _id: -1 })
      .limit(6)
      .lean()
      .exec();

    res.json({
      ok: true,
      data: {
        customers,
        buses: totalBuses,
        routes: totalRoutes,
        drivers: totalDrivers,
        bookings: totalBookings,
        confirmedBookings,
        cancelledBookings,
        pendingBookings,
        completedBookings,
        failedBookings,
        todayBookings,
        upcomingJourneys,
        activeBuses: totalBuses,
        revenue: totalRevenueAgg[0]?.total || 0,
        todayRevenue: todayRevenueAgg[0]?.total || 0,
        weekRevenue: weekRevenueAgg[0]?.total || 0,
        monthRevenue: monthRevenueAgg[0]?.total || 0,
        refundedAmount: cancelledRevenueAgg[0]?.total || 0,
        netRevenue: (totalRevenueAgg[0]?.total || 0) - (cancelledRevenueAgg[0]?.total || 0),
        pendingReports,
        totalPosts,
        totalPayments,
        successfulPayments,
        failedPayments,
        pendingPayments,
        activeOffers,
        recentBookings,
      },
    });
  } catch (err) {
    console.error("Dashboard stats error:", err);
    res.status(500).json({ ok: false, message: "Could not load dashboard stats." });
  }
};

// ---------------- Users ----------------

exports.listUsers = async (req, res) => {
  try {
    const { page, limit } = parsePage(req);
    const { search = "", verified, suspended } = req.query;
    const filter = {};
    if (search) {
      filter.$or = [
        { name: { $regex: escapeRegex(search), $options: "i" } },
        { email: { $regex: escapeRegex(search), $options: "i" } },
        { phone: { $regex: escapeRegex(search), $options: "i" } },
      ];
    }
    if (verified === "true") filter.isVerified = true;
    if (verified === "false") filter.isVerified = false;
    if (suspended === "true") filter.isSuspended = true;
    if (suspended === "false") filter.isSuspended = false;

    const [total, items] = await Promise.all([
      Customer.countDocuments(filter),
      Customer.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
    ]);
    res.json({ ok: true, data: { items, total, page, limit, hasMore: page * limit < total } });
  } catch (err) {
    res.status(500).json({ ok: false, message: "Could not load users." });
  }
};

exports.getUser = async (req, res) => {
  try {
    const user = await Customer.findById(req.params.id).lean().exec();
    if (!user) return res.status(404).json({ ok: false, message: "User not found." });
    const bookings = await Booking.find({ customerId: req.params.id })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean()
      .exec();
    const notifications = await Notification.find({ userId: req.params.id })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean()
      .exec();
    res.json({ ok: true, data: { user, bookings, notifications } });
  } catch (err) {
    res.status(500).json({ ok: false, message: "Could not load user." });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id).exec();
    if (!customer) return res.status(404).json({ ok: false, message: "User not found." });

    const { action, value, ...directFields } = req.body || {};

    if (action) {
      if (!["verify", "suspend"].includes(action)) {
        return res.status(400).json({ ok: false, message: "action must be 'verify' or 'suspend'." });
      }
      if (action === "verify") customer.isVerified = Boolean(value);
      if (action === "suspend") customer.isSuspended = Boolean(value);
    } else {
      const allowedFields = ["isVerified", "isSuspended", "name", "email", "phone"];
      for (const key of allowedFields) {
        if (directFields[key] !== undefined) {
          customer[key] = directFields[key];
        }
      }
    }

    await customer.save();
    res.json({ ok: true, data: { user: customer.toObject() } });
  } catch (err) {
    res.status(500).json({ ok: false, message: "Could not update user." });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const customer = await Customer.findByIdAndDelete(req.params.id).lean();
    if (!customer) return res.status(404).json({ ok: false, message: "User not found." });
    await Booking.deleteMany({ customerId: req.params.id });
    res.json({ ok: true, data: { deleted: true } });
  } catch (err) {
    res.status(500).json({ ok: false, message: "Could not delete user." });
  }
};

// ---------------- Buses ----------------

exports.listBuses = async (req, res) => {
  try {
    const { page, limit } = parsePage(req);
    const { search = "" } = req.query;
    const filter = search
      ? {
          $or: [
            { operatorName: { $regex: escapeRegex(search), $options: "i" } },
            { busType: { $regex: escapeRegex(search), $options: "i" } },
          ],
        }
      : {};
    const [total, items] = await Promise.all([
      Bus.countDocuments(filter),
      Bus.find(filter)
        .populate("routes")
        .sort({ operatorName: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
    ]);
    res.json({ ok: true, data: { items, total, page, limit, hasMore: page * limit < total } });
  } catch (err) {
    res.status(500).json({ ok: false, message: "Could not load buses." });
  }
};

exports.createBus = async (req, res) => {
  try {
    const body = pickFields(req.body, ["busname","busnumber","busoperator","operatorName","busType","seats","amenities","fare","routes","seatLayout","photos","departureTime","arrivalTime","isActive"]);
    if (body.routes) body.routes = String(body.routes);
    const bus = await Bus.create(body);
    res.status(201).json({ ok: true, data: bus });
  } catch (err) {
    res.status(400).json({ ok: false, message: "Could not create bus." });
  }
};

exports.updateBus = async (req, res) => {
  try {
    const body = pickFields(req.body, ["busname","busnumber","busoperator","operatorName","busType","seats","amenities","fare","routes","seatLayout","photos","departureTime","arrivalTime","isActive"]);
    if (body.routes) body.routes = String(body.routes);
    const bus = await Bus.findByIdAndUpdate(
      req.params.id,
      { $set: body },
      { new: true, runValidators: true }
    ).exec();
    if (!bus) return res.status(404).json({ ok: false, message: "Bus not found." });
    res.json({ ok: true, data: bus });
  } catch (err) {
    res.status(400).json({ ok: false, message: "Could not update bus." });
  }
};

exports.deleteBus = async (req, res) => {
  try {
    const hasBookings = await Booking.countDocuments({ busId: req.params.id });
    if (hasBookings > 0) {
      return res.status(400).json({
        ok: false,
        message: `Cannot delete: ${hasBookings} booking(s) reference this bus. Deactivate instead.`,
      });
    }
    const bus = await Bus.findByIdAndDelete(req.params.id).lean();
    if (!bus) return res.status(404).json({ ok: false, message: "Bus not found." });
    res.json({ ok: true, data: { deleted: true } });
  } catch (err) {
    res.status(500).json({ ok: false, message: "Could not delete bus." });
  }
};

// ---------------- Routes ----------------

exports.listRoutes = async (req, res) => {
  try {
    const { page, limit } = parsePage(req);
    const { search = "" } = req.query;
    const filter = search
      ? {
          $or: [
            { "departureLocation.name": { $regex: escapeRegex(search), $options: "i" } },
            { "arrivalLocation.name": { $regex: escapeRegex(search), $options: "i" } },
          ],
        }
      : {};
    const [total, items] = await Promise.all([
      Route.countDocuments(filter),
      Route.find(filter)
        .sort({ "departureLocation.name": 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
    ]);
    res.json({ ok: true, data: { items, total, page, limit, hasMore: page * limit < total } });
  } catch (err) {
    res.status(500).json({ ok: false, message: "Could not load routes." });
  }
};

async function findDuplicateRoute(body, excludeId) {
  const dep = body?.departureLocation?.name;
  const arr = body?.arrivalLocation?.name;
  if (!dep || !arr) return null;
  const dup = await Route.findOne({
    _id: { $ne: excludeId },
    "departureLocation.name": { $regex: `^${escapeRegex(dep.trim())}$`, $options: "i" },
    "arrivalLocation.name": { $regex: `^${escapeRegex(arr.trim())}$`, $options: "i" },
  })
    .lean()
    .exec();
  return dup;
}

exports.createRoute = async (req, res) => {
  try {
    const dup = await findDuplicateRoute(req.body);
    if (dup) {
      return res.status(400).json({
        ok: false,
        message: `Duplicate route: ${dup.departureLocation.name} → ${dup.arrivalLocation.name} already exists.`,
      });
    }
    const route = await Route.create(req.body);
    res.status(201).json({ ok: true, data: route });
  } catch (err) {
    res.status(400).json({ ok: false, message: "Could not create route." });
  }
};

exports.updateRoute = async (req, res) => {
  try {
    const dup = await findDuplicateRoute(req.body, req.params.id);
    if (dup) {
      return res.status(400).json({
        ok: false,
        message: `Duplicate route: ${dup.departureLocation.name} → ${dup.arrivalLocation.name} already exists.`,
      });
    }
    const route = await Route.findByIdAndUpdate(
      req.params.id,
      { $set: pickFields(req.body, ["departureLocation","arrivalLocation","distance","duration","isActive","subLocations","fareConfig","totalDistanceKm","routeName","stops"]) },
      { new: true, runValidators: true }
    ).exec();
    if (!route) return res.status(404).json({ ok: false, message: "Route not found." });
    res.json({ ok: true, data: route });
  } catch (err) {
    res.status(400).json({ ok: false, message: "Could not update route." });
  }
};

exports.deleteRoute = async (req, res) => {
  try {
    const hasBuses = await Bus.countDocuments({ routes: req.params.id });
    if (hasBuses > 0) {
      return res.status(400).json({
        ok: false,
        message: `Cannot delete: ${hasBuses} bus(es) use this route. Deactivate instead.`,
      });
    }
    const route = await Route.findByIdAndDelete(req.params.id).lean();
    if (!route) return res.status(404).json({ ok: false, message: "Route not found." });
    res.json({ ok: true, data: { deleted: true } });
  } catch (err) {
    res.status(500).json({ ok: false, message: "Could not delete route." });
  }
};

// ---------------- Bookings ----------------

exports.listBookings = async (req, res) => {
  try {
    const { page, limit } = parsePage(req);
    const { search = "", status, from, to } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (from || to) {
      const range = {};
      if (from) range.$gte = from + "T00:00:00.000Z";
      if (to) range.$lte = to + "T23:59:59.999Z";
      filter.createdAt = range;
    }
    if (search) {
      filter.$or = [
        { pnr: { $regex: escapeRegex(search), $options: "i" } },
        { email: { $regex: escapeRegex(search), $options: "i" } },
        { phoneNumber: { $regex: escapeRegex(search), $options: "i" } },
        { "departureDetails.city": { $regex: escapeRegex(search), $options: "i" } },
        { "arrivalDetails.city": { $regex: escapeRegex(search), $options: "i" } },
        { "passengerDetails.name": { $regex: escapeRegex(search), $options: "i" } },
      ];
    }
    const [total, items] = await Promise.all([
      Booking.countDocuments(filter),
      Booking.find(filter)
        .sort({ _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
    ]);
    res.json({ ok: true, data: { items, total, page, limit, hasMore: page * limit < total } });
  } catch (err) {
    res.status(500).json({ ok: false, message: "Could not load bookings." });
  }
};

exports.getBooking = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id).lean().exec();
    if (!booking) return res.status(404).json({ ok: false, message: "Booking not found." });
    const bus = booking.busId ? await Bus.findById(booking.busId).lean().exec() : null;
    res.json({ ok: true, data: { booking, bus } });
  } catch (err) {
    res.status(500).json({ ok: false, message: "Could not load booking." });
  }
};

exports.cancelBooking = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id).exec();
    if (!booking) return res.status(404).json({ ok: false, message: "Booking not found." });
    if (booking.status === "cancelled") {
      return res.status(400).json({ ok: false, message: "Booking is already cancelled." });
    }
    const prevStatus = booking.status;
    booking.status = "cancelled";
    booking.paymentStatus = "refunded";
    booking.timeline = booking.timeline || [];
    booking.timeline.push({ status: "cancelled", at: new Date() });
    await booking.save();

    const SeatLock = require("../models/seatLock");
    if (booking.busId) {
      await SeatLock.updateOne(
        { busId: String(booking.busId), date: booking.departureDetails?.date },
        { $pull: { bookedSeats: { $in: booking.seats || [] } } }
      );
    }

    const notificationService = require("../services/notificationService");
    await notificationService.notifyBookingCancelled(booking).catch((e) =>
      console.error("cancel notification error:", e.message)
    );
    await notificationService.notifyRefundInitiated(booking, booking.fare).catch((e) =>
      console.error("refund notification error:", e.message)
    );

    res.json({ ok: true, data: { booking, previousStatus: prevStatus } });
  } catch (err) {
    res.status(500).json({ ok: false, message: "Could not cancel booking." });
  }
};

// ---------------- Payments ----------------

exports.listPayments = async (req, res) => {
  try {
    const { page, limit } = parsePage(req);
    const { search = "", status } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (search) {
      filter.$or = [
        { paymentReference: { $regex: escapeRegex(search), $options: "i" } },
        { transactionId: { $regex: escapeRegex(search), $options: "i" } },
        { customerId: { $regex: escapeRegex(search), $options: "i" } },
      ];
    }
    const [total, items] = await Promise.all([
      PaymentAttempt.countDocuments(filter),
      PaymentAttempt.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
    ]);

    const bookingIds = [...new Set(items.map((p) => p.bookingId).filter(Boolean))];
    const paymentRefs = [...new Set(items.map((p) => p.paymentReference).filter(Boolean))];

    const [bookingsById, bookingsByRef] = await Promise.all([
      bookingIds.length ? Booking.find({ _id: { $in: bookingIds } }).lean().exec() : [],
      paymentRefs.length ? Booking.find({ paymentReference: { $in: paymentRefs } }).lean().exec() : [],
    ]);

    const bookingMap = new Map();
    for (const b of bookingsById) bookingMap.set(String(b._id), b);
    const bookingByRefMap = new Map();
    for (const b of bookingsByRef) {
      bookingByRefMap.set(b.paymentReference, b);
      if (!bookingMap.has(String(b._id))) bookingMap.set(String(b._id), b);
    }

    const allCustomerIds = new Set();
    for (const p of items) {
      if (p.customerId) allCustomerIds.add(p.customerId);
    }
    for (const b of bookingMap.values()) {
      if (b.customerId) allCustomerIds.add(b.customerId);
    }
    const cidArr = [...allCustomerIds];

    const busIds = new Set();
    for (const b of bookingMap.values()) {
      if (b.busId) busIds.add(b.busId);
    }
    const bidArr = [...busIds];

    const [customers, buses] = await Promise.all([
      cidArr.length ? Customer.find({ _id: { $in: cidArr } }).select("name email phone").lean().exec() : [],
      bidArr.length ? Bus.find({ _id: { $in: bidArr } }).select("operatorName busType").lean().exec() : [],
    ]);

    const customerMap = new Map(customers.map((c) => [String(c._id), c]));
    const busMap = new Map(buses.map((b) => [String(b._id), b]));

    const enrichedItems = items.map((p) => {
      const booking = bookingMap.get(p.bookingId) || bookingByRefMap.get(p.paymentReference) || null;
      const customer = booking
        ? customerMap.get(booking.customerId) || customerMap.get(p.customerId)
        : customerMap.get(p.customerId);
      const bus = booking ? busMap.get(booking.busId) : null;

      return {
        _id: p._id,
        paymentReference: p.paymentReference || "",
        transactionId: p.transactionId || "",
        amount: p.amount || 0,
        method: p.method || "",
        status: p.status || "",
        customerId: p.customerId || "",
        bookingId: p.bookingId || "",
        createdAt: p.createdAt,
        expiresAt: p.expiresAt,
        pnr: booking?.pnr || "",
        customerName: customer?.name || "",
        email: customer?.email || booking?.email || "",
        phoneNumber: customer?.phone || booking?.phoneNumber || "",
        fare: booking?.fare || 0,
        seats: booking?.seats || [],
        operatorName: booking?.busDetails?.operatorName || bus?.operatorName || "",
        busType: booking?.busDetails?.busType || bus?.busType || "",
        departureCity: booking?.departureDetails?.city || "",
        arrivalCity: booking?.arrivalDetails?.city || "",
        journeyDate: booking?.departureDetails?.date || "",
        departureTime: booking?.departureDetails?.time,
        passengerCount: booking?.passengerDetails?.length || 0,
        bookingStatus: booking?.status || "",
        paymentStatus: booking?.paymentStatus || "",
      };
    });

    res.json({ ok: true, data: { items: enrichedItems, total, page, limit, hasMore: page * limit < total } });
  } catch (err) {
    console.error("listPayments error:", err);
    res.status(500).json({ ok: false, message: "Could not load payments." });
  }
};

exports.getPaymentSettings = paymentCtrl.getPaymentSettings;
exports.updatePaymentSettings = paymentCtrl.updatePaymentSettings;

// ---------------- Cancellations ----------------

exports.listCancellations = async (req, res) => {
  try {
    const { page, limit } = parsePage(req);
    const { search = "" } = req.query;
    const filter = { status: "cancelled" };
    if (search) {
      filter.$or = [
        { pnr: { $regex: escapeRegex(search), $options: "i" } },
        { email: { $regex: escapeRegex(search), $options: "i" } },
        { phoneNumber: { $regex: escapeRegex(search), $options: "i" } },
        { "departureDetails.city": { $regex: escapeRegex(search), $options: "i" } },
        { "arrivalDetails.city": { $regex: escapeRegex(search), $options: "i" } },
      ];
    }
    const [total, items] = await Promise.all([
      Booking.countDocuments(filter),
      Booking.find(filter)
        .sort({ _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
    ]);
    res.json({ ok: true, data: { items, total, page, limit, hasMore: page * limit < total } });
  } catch (err) {
    res.status(500).json({ ok: false, message: "Could not load cancellations." });
  }
};

// ---------------- Drivers ----------------

exports.listDrivers = async (req, res) => {
  try {
    const { page, limit } = parsePage(req);
    const { search = "" } = req.query;
    const filter = {};
    if (search) {
      filter.$or = [
        { name: { $regex: escapeRegex(search), $options: "i" } },
        { phone: { $regex: escapeRegex(search), $options: "i" } },
        { licenseNumber: { $regex: escapeRegex(search), $options: "i" } },
      ];
    }
    const [total, items] = await Promise.all([
      Driver.countDocuments(filter),
      Driver.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
    ]);
    res.json({ ok: true, data: { items, total, page, limit, hasMore: page * limit < total } });
  } catch (err) {
    res.status(500).json({ ok: false, message: "Could not load drivers." });
  }
};

exports.createDriver = async (req, res) => {
  try {
    const body = pickFields(req.body, ["name","phone","licenseNumber","busId","isActive"]);
    const driver = await Driver.create(body);
    res.status(201).json({ ok: true, data: driver });
  } catch (err) {
    res.status(400).json({ ok: false, message: "Could not create driver." });
  }
};

exports.updateDriver = async (req, res) => {
  try {
    const body = pickFields(req.body, ["name","phone","licenseNumber","busId","isActive"]);
    const driver = await Driver.findByIdAndUpdate(
      req.params.id,
      { $set: body },
      { new: true, runValidators: true }
    ).exec();
    if (!driver) return res.status(404).json({ ok: false, message: "Driver not found." });
    res.json({ ok: true, data: driver });
  } catch (err) {
    res.status(400).json({ ok: false, message: "Could not update driver." });
  }
};

exports.deleteDriver = async (req, res) => {
  try {
    const driver = await Driver.findByIdAndDelete(req.params.id).lean();
    if (!driver) return res.status(404).json({ ok: false, message: "Driver not found." });
    res.json({ ok: true, data: { deleted: true } });
  } catch (err) {
    res.status(500).json({ ok: false, message: "Could not delete driver." });
  }
};

// ---------------- Community Moderation ----------------

exports.listReports = async (req, res) => {
  try {
    const { page, limit } = parsePage(req);
    const { status, search } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (search) {
      const re = new RegExp(escapeRegex(search), "i");
      filter.$or = [
        { reporterUserId: re },
        { reason: re },
        { details: re },
        { postId: re },
        { commentId: re },
      ];
    }
    const [total, items] = await Promise.all([
      CommunityReport.countDocuments(filter),
      CommunityReport.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
    ]);

    const reporterIds = [...new Set(items.map((r) => r.reporterUserId).filter(Boolean))];
    const postIds = [...new Set(items.map((r) => r.postId).filter(Boolean))];
    const commentIds = [...new Set(items.map((r) => r.commentId).filter(Boolean))];

    const [reporters, posts, comments] = await Promise.all([
      reporterIds.length ? Customer.find({ _id: { $in: reporterIds } }).select("name email").lean().exec() : [],
      postIds.length ? CommunityPost.find({ _id: { $in: postIds } }).select("title story userId route category moderationStatus").lean().exec() : [],
      commentIds.length ? CommunityComment.find({ _id: { $in: commentIds } }).select("content userId postId").lean().exec() : [],
    ]);

    const reporterMap = new Map(reporters.map((c) => [String(c._id), c]));
    const postMap = new Map(posts.map((p) => [String(p._id), p]));
    const commentMap = new Map(comments.map((c) => [String(c._id), c]));

    const enrichedItems = items.map((r) => {
      const reporter = reporterMap.get(r.reporterUserId);
      const post = r.postId ? postMap.get(r.postId) : null;
      const comment = r.commentId ? commentMap.get(r.commentId) : null;

      return {
        ...r,
        reporterName: reporter?.name || r.reporterUserId || "",
        reporterEmail: reporter?.email || "",
        postTitle: post?.title || "",
        postStory: post?.story || "",
        postUserId: post?.userId || "",
        postRoute: post?.route || "",
        postCategory: post?.category || "",
        postStatus: post?.moderationStatus || "",
        commentContent: comment?.content || "",
        commentUserId: comment?.userId || "",
      };
    });

    res.json({ ok: true, data: { items: enrichedItems, total, page, limit, hasMore: page * limit < total } });
  } catch (err) {
    console.error("listReports error:", err);
    res.status(500).json({ ok: false, message: "Could not load reports." });
  }
};

exports.updateReport = async (req, res) => {
  try {
    const { status, reason } = req.body || {};
    if (!["pending", "actioned", "dismissed"].includes(status)) {
      return res.status(400).json({ ok: false, message: "Invalid report status." });
    }
    const prev = await CommunityReport.findById(req.params.id).lean();
    if (!prev) return res.status(404).json({ ok: false, message: "Report not found." });

    const report = await CommunityReport.findByIdAndUpdate(
      req.params.id,
      { $set: { status } },
      { new: true }
    ).lean();

    if (status === "actioned" && report.postId) {
      await CommunityPost.findByIdAndUpdate(report.postId, {
        $set: { removedByAdmin: true, moderationStatus: "hidden", moderatedBy: req.userId || "admin", moderatedAt: new Date() },
      });
    }

    await ModerationLog.create({
      adminId: req.userId || "admin",
      action: status === "actioned" ? "report_actioned" : "report_dismiss",
      targetType: "report",
      targetId: req.params.id,
      reason: reason || "",
      previousStatus: prev.status,
      newStatus: status,
    }).catch(() => {});

    res.json({ ok: true, data: report });
  } catch (err) {
    res.status(500).json({ ok: false, message: "Could not update report." });
  }
};

exports.listCommunityPosts = async (req, res) => {
  try {
    const { page, limit } = parsePage(req);
    const { removed, moderationStatus, search, category } = req.query;
    const filter = {};
    if (removed === "true") filter.removedByAdmin = true;
    else if (removed === "false") filter.removedByAdmin = false;
    if (moderationStatus) filter.moderationStatus = moderationStatus;
    else if (!removed) filter.moderationStatus = { $ne: "removed" };
    if (category) filter.category = category;
    if (search) {
      const re = new RegExp(escapeRegex(search), "i");
      filter.$or = [
        { title: re },
        { story: re },
        { route: re },
        { destination: re },
        { userId: re },
      ];
    }
    const [total, items] = await Promise.all([
      CommunityPost.countDocuments(filter),
      CommunityPost.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
    ]);

    const userIds = [...new Set(items.map((p) => p.userId).filter(Boolean))];
    const owners = userIds.length
      ? await Customer.find({ _id: { $in: userIds } }).select("name email").lean().exec()
      : [];
    const ownerMap = new Map(owners.map((c) => [String(c._id), c]));

    const reportCounts = await CommunityReport.aggregate([
      { $match: { postId: { $in: items.map((p) => String(p._id)) } } },
      { $group: { _id: "$postId", count: { $sum: 1 } } },
    ]);
    const reportCountMap = new Map(reportCounts.map((r) => [r._id, r.count]));

    const enrichedItems = items.map((p) => {
      const owner = ownerMap.get(p.userId);
      return {
        ...p,
        ownerName: owner?.name || "",
        ownerEmail: owner?.email || "",
        reportCount: reportCountMap.get(String(p._id)) || 0,
      };
    });

    res.json({ ok: true, data: { items: enrichedItems, total, page, limit, hasMore: page * limit < total } });
  } catch (err) {
    res.status(500).json({ ok: false, message: "Could not load community posts." });
  }
};

exports.moderatePost = async (req, res) => {
  try {
    const { action, reason } = req.body || {};
    if (!["hide", "restore", "remove"].includes(action)) {
      return res.status(400).json({ ok: false, message: "action must be 'hide', 'restore', or 'remove'." });
    }
    const prev = await CommunityPost.findById(req.params.id).lean();
    if (!prev) return res.status(404).json({ ok: false, message: "Post not found." });

    const updateFields = {};
    if (action === "hide") {
      updateFields.removedByAdmin = true;
      updateFields.moderationStatus = "hidden";
    } else if (action === "restore") {
      updateFields.removedByAdmin = false;
      updateFields.moderationStatus = "active";
    } else if (action === "remove") {
      updateFields.removedByAdmin = true;
      updateFields.moderationStatus = "removed";
    }
    updateFields.moderatedBy = req.userId || "admin";
    updateFields.moderatedAt = new Date();
    updateFields.moderationNote = reason || "";

    const post = await CommunityPost.findByIdAndUpdate(
      req.params.id,
      { $set: updateFields },
      { new: true }
    ).lean();

    await ModerationLog.create({
      adminId: req.userId || "admin",
      action: `post_${action}`,
      targetType: "post",
      targetId: req.params.id,
      reason: reason || "",
      previousStatus: prev.moderationStatus || "active",
      newStatus: updateFields.moderationStatus,
    }).catch(() => {});

    res.json({ ok: true, data: post });
  } catch (err) {
    res.status(500).json({ ok: false, message: "Could not moderate post." });
  }
};

exports.listComments = async (req, res) => {
  try {
    const { page, limit } = parsePage(req);
    const { deleted, search, postId } = req.query;
    const filter = {};
    if (deleted === "true") filter.deleted = true;
    else if (deleted === "false") filter.deleted = false;
    if (postId) filter.postId = postId;
    if (search) {
      const re = new RegExp(escapeRegex(search), "i");
      filter.$or = [
        { content: re },
        { userId: re },
      ];
    }
    const [total, items] = await Promise.all([
      CommunityComment.countDocuments(filter),
      CommunityComment.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
    ]);

    const userIds = [...new Set(items.map((c) => c.userId).filter(Boolean))];
    const postIds = [...new Set(items.map((c) => c.postId).filter(Boolean))];

    const [users, posts] = await Promise.all([
      userIds.length ? Customer.find({ _id: { $in: userIds } }).select("name email").lean().exec() : [],
      postIds.length ? CommunityPost.find({ _id: { $in: postIds } }).select("title").lean().exec() : [],
    ]);

    const userMap = new Map(users.map((u) => [String(u._id), u]));
    const postTitleMap = new Map(posts.map((p) => [String(p._id), p.title]));

    const enrichedItems = items.map((c) => {
      const user = userMap.get(c.userId);
      return {
        ...c,
        userName: user?.name || "",
        userEmail: user?.email || "",
        postTitle: postTitleMap.get(c.postId) || "",
      };
    });

    res.json({ ok: true, data: { items: enrichedItems, total, page, limit, hasMore: page * limit < total } });
  } catch (err) {
    console.error("listComments error:", err);
    res.status(500).json({ ok: false, message: "Could not load comments." });
  }
};

exports.moderateComment = async (req, res) => {
  try {
    const { action, reason } = req.body || {};
    if (!["hide", "restore", "remove"].includes(action)) {
      return res.status(400).json({ ok: false, message: "action must be 'hide', 'restore', or 'remove'." });
    }
    const prev = await CommunityComment.findById(req.params.id).lean();
    if (!prev) return res.status(404).json({ ok: false, message: "Comment not found." });

    const deleted = action === "remove" || action === "hide";
    const comment = await CommunityComment.findByIdAndUpdate(
      req.params.id,
      { $set: { deleted } },
      { new: true }
    ).lean();

    await ModerationLog.create({
      adminId: req.userId || "admin",
      action: `comment_${action}`,
      targetType: "comment",
      targetId: req.params.id,
      reason: reason || "",
      previousStatus: prev.deleted ? "hidden" : "active",
      newStatus: action === "restore" ? "active" : "hidden",
    }).catch(() => {});

    res.json({ ok: true, data: comment });
  } catch (err) {
    res.status(500).json({ ok: false, message: "Could not moderate comment." });
  }
};

exports.getCommunityStats = async (req, res) => {
  try {
    const [totalPosts, activePosts, hiddenPosts, removedPosts, totalComments, deletedComments, pendingReports, totalReports, actionedReports, moderationActions] = await Promise.all([
      CommunityPost.countDocuments(),
      CommunityPost.countDocuments({ moderationStatus: { $in: ["active", null] } }),
      CommunityPost.countDocuments({ moderationStatus: "hidden" }),
      CommunityPost.countDocuments({ moderationStatus: "removed" }),
      CommunityComment.countDocuments(),
      CommunityComment.countDocuments({ deleted: true }),
      CommunityReport.countDocuments({ status: "pending" }),
      CommunityReport.countDocuments(),
      CommunityReport.countDocuments({ status: "actioned" }),
      ModerationLog.countDocuments(),
    ]);
    res.json({
      ok: true,
      data: {
        totalPosts, activePosts, hiddenPosts, removedPosts,
        totalComments, deletedComments,
        pendingReports, totalReports, actionedReports,
        moderationActions,
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, message: "Could not load community stats." });
  }
};

exports.getModerationLog = async (req, res) => {
  try {
    const { page, limit } = parsePage(req);
    const { action, targetType, adminId } = req.query;
    const filter = {};
    if (action) filter.action = action;
    if (targetType) filter.targetType = targetType;
    if (adminId) filter.adminId = adminId;
    const [total, items] = await Promise.all([
      ModerationLog.countDocuments(filter),
      ModerationLog.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
    ]);
    res.json({ ok: true, data: { items, total, page, limit, hasMore: page * limit < total } });
  } catch (err) {
    res.status(500).json({ ok: false, message: "Could not load moderation log." });
  }
};

// ---------------- Reviews ----------------

exports.listReviews = async (req, res) => {
  try {
    const { page, limit } = parsePage(req);
    const { visible, busId } = req.query;
    const filter = {};
    if (visible === "true") filter.visible = true;
    else if (visible === "false") filter.visible = false;
    if (busId) filter.busId = busId;
    const [total, items] = await Promise.all([
      Review.countDocuments(filter),
      Review.find(filter)
        .populate("busId", "operatorName busType")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
    ]);
    res.json({ ok: true, data: { items, total, page, limit, hasMore: page * limit < total } });
  } catch (err) {
    res.status(500).json({ ok: false, message: "Could not load reviews." });
  }
};

exports.updateReview = async (req, res) => {
  try {
    const { visible } = req.body || {};
    if (typeof visible !== "boolean") {
      return res.status(400).json({ ok: false, message: "visible (boolean) is required." });
    }
    const review = await Review.findByIdAndUpdate(
      req.params.id,
      { $set: { visible } },
      { new: true }
    ).lean();
    if (!review) return res.status(404).json({ ok: false, message: "Review not found." });
    res.json({ ok: true, data: review });
  } catch (err) {
    res.status(500).json({ ok: false, message: "Could not update review." });
  }
};

exports.deleteReview = async (req, res) => {
  try {
    const review = await Review.findByIdAndDelete(req.params.id).lean();
    if (!review) return res.status(404).json({ ok: false, message: "Review not found." });
    res.json({ ok: true, data: { deleted: true } });
  } catch (err) {
    res.status(500).json({ ok: false, message: "Could not delete review." });
  }
};

// ---------------- Notifications ----------------

exports.notificationStats = notificationCtrl.adminStats;
exports.notificationList = notificationCtrl.adminList;
exports.sendOffer = notificationCtrl.adminSendOffer;
exports.sendCoupon = notificationCtrl.adminSendCoupon;
exports.sendBusStatus = notificationCtrl.adminBusStatus;

// ---------------- Analytics ----------------

exports.getAnalytics = async (req, res) => {
  try {
    const { start, end } = parseDateRange(req);
    const days = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24))) || 7;

    const [bookingsByDay, revenueByRoute, topRoutes, statusBreakdown] =
      await Promise.all([
        Booking.aggregate([
          { $match: { createdAt: { $gte: start, $lte: end } } },
          {
            $group: {
              _id: {
                $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
              },
              count: { $sum: 1 },
              revenue: { $sum: "$fare" },
            },
          },
          { $sort: { _id: 1 } },
        ]),
        Booking.aggregate([
          { $match: { createdAt: { $gte: start, $lte: end }, status: { $in: ["ticket_confirmed", "payment_verified", "completed"] } } },
          {
            $group: {
              _id: "$departureDetails.city",
              revenue: { $sum: "$fare" },
              count: { $sum: 1 },
            },
          },
          { $sort: { revenue: -1 } },
          { $limit: 6 },
        ]),
        Booking.aggregate([
          { $match: { createdAt: { $gte: start, $lte: end } } },
          {
            $group: {
              _id: {
                $concat: ["$departureDetails.city", " → ", "$arrivalDetails.city"],
              },
              count: { $sum: 1 },
            },
          },
          { $sort: { count: -1 } },
          { $limit: 10 },
        ]),
        Booking.aggregate([
          { $match: { createdAt: { $gte: start, $lte: end } } },
          { $group: { _id: "$status", count: { $sum: 1 } } },
        ]),
      ]);

    const busOccupancy = await Bus.aggregate([
      {
        $lookup: {
          from: "bookings",
          localField: "_id",
          foreignField: "busId",
          pipeline: [{ $match: { createdAt: { $gte: start, $lte: end } } }],
          as: "booked",
        },
      },
      {
        $project: {
          operatorName: 1,
          totalSeats: 1,
          busType: 1,
          bookedCount: { $size: "$booked" },
        },
      },
      { $sort: { bookedCount: -1 } },
      { $limit: 10 },
    ]);

    const peakHours = await Booking.aggregate([
      { $match: { createdAt: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: { $hour: "$createdAt" },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 5 },
    ]);

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0, 0, 0, 0);
    const monthlyRevenue = await Booking.aggregate([
      { $match: { createdAt: { $gte: sixMonthsAgo }, status: { $in: ["ticket_confirmed", "payment_verified", "completed"] } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
          revenue: { $sum: "$fare" },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.json({
      ok: true,
      data: {
        bookingsByDay,
        revenueByRoute,
        topRoutes,
        busOccupancy,
        statusBreakdown,
        peakHours,
        monthlyRevenue,
      },
    });
  } catch (err) {
    console.error("Analytics error:", err);
    res.status(500).json({ ok: false, message: "Could not load analytics." });
  }
};

// ---------------- Reports ----------------

exports.generateReport = async (req, res) => {
  try {
    const { type } = req.params;
    const { start, end } = parseDateRange(req);
    let data;

    switch (type) {
      case "bookings": {
        data = await Booking.find({ createdAt: { $gte: start, $lte: end } })
          .sort({ createdAt: -1 })
          .lean()
          .exec();
        break;
      }
      case "revenue": {
        data = await Booking.aggregate([
          { $match: { createdAt: { $gte: start, $lte: end }, status: { $in: ["ticket_confirmed", "payment_verified", "completed"] } } },
          {
            $group: {
              _id: {
                date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                route: { $concat: ["$departureDetails.city", " → ", "$arrivalDetails.city"] },
              },
              revenue: { $sum: "$fare" },
              count: { $sum: 1 },
            },
          },
          { $sort: { "_id.date": 1 } },
        ]);
        break;
      }
      case "cancellations": {
        data = await Booking.find({ createdAt: { $gte: start, $lte: end }, status: "cancelled" })
          .sort({ createdAt: -1 })
          .lean()
          .exec();
        break;
      }
      case "users": {
        data = await Customer.find({ createdAt: { $gte: start, $lte: end } })
          .sort({ createdAt: -1 })
          .lean()
          .exec();
        break;
      }
      case "payments": {
        data = await PaymentAttempt.find({ createdAt: { $gte: start, $lte: end } })
          .sort({ createdAt: -1 })
          .lean()
          .exec();
        break;
      }
      default:
        return res.status(400).json({ ok: false, message: "Unknown report type." });
    }

    res.json({ ok: true, data: { type, start, end, records: data, total: data.length } });
  } catch (err) {
    console.error("Report error:", err);
    res.status(500).json({ ok: false, message: "Could not generate report." });
  }
};
