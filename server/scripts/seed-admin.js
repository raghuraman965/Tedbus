/**
 * Seed the default TedBus Admin account and (optionally) backfill sample
 * reviews from existing bus ratings so the admin Reviews module has data.
 *
 * Usage:  cd server && node scripts/seed-admin.js
 *
 * Credentials and DB URL are read from server/.env (ADMIN_SEED_USERNAME,
 * ADMIN_SEED_PASSWORD, MONGODB_URI) — copy server/.env.example first.
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const Admin = require("../models/admin");
const Review = require("../models/review");
const Bus = require("../models/bus");
const Customer = require("../models/customer");

const DBURL = process.env.MONGODB_URI;
if (!DBURL) {
  console.error("❌ MONGODB_URI is not set. Copy server/.env.example to server/.env and fill it in.");
  process.exit(1);
}

async function seedAdmin() {
  const username = process.env.ADMIN_SEED_USERNAME;
  const password = process.env.ADMIN_SEED_PASSWORD;
  if (!username || !password) {
    console.error("❌ ADMIN_SEED_USERNAME and ADMIN_SEED_PASSWORD must be set in server/.env (see server/.env.example).");
    process.exit(1);
  }

  let admin = await Admin.findOne({ username });
  if (!admin) {
    admin = await Admin.create({
      username,
      password: await bcrypt.hash(password, 10),
      name: "TedBus Admin",
      role: "superadmin",
    });
    console.log("✅ Default admin account created.");
  } else {
    admin.password = await bcrypt.hash(password, 10);
    admin.isActive = true;
    await admin.save();
    console.log("ℹ️  Default admin account already exists — password reset.");
  }
  console.log("   Username: " + username);
  console.log("   Password: " + password);
}

async function seedSampleReviews() {
  const existing = await Review.countDocuments();
  if (existing > 0) {
    console.log(`ℹ️  ${existing} review(s) already exist — skipping review backfill.`);
    return;
  }
  const [buses, customers] = await Promise.all([
    Bus.find().lean().exec(),
    Customer.find().lean().exec(),
  ]);
  const comments = [
    "Smooth and comfortable ride. Highly recommend.",
    "On-time departure, clean seats.",
    "Great driver and value for money.",
    "Decent journey, could improve amenities.",
    "Good experience overall, will book again.",
  ];
  let created = 0;
  for (const bus of buses.slice(0, 12)) {
    const ratings = Array.isArray(bus.rating) ? bus.rating : [];
    for (const rating of ratings.slice(0, 2)) {
      const customer = customers.length
        ? customers[Math.floor(Math.random() * customers.length)]
        : null;
      await Review.create({
        busId: bus._id,
        customerId: customer ? String(customer._id) : "seed",
        customerName: customer ? customer.name || customer.email : "TedBus Traveller",
        rating: Math.min(5, Math.max(1, Math.round(Number(rating) || 4))),
        comment: comments[Math.floor(Math.random() * comments.length)],
      });
      created += 1;
    }
  }
  console.log(`✅ Seeded ${created} sample review(s) from existing bus ratings.`);
}

async function main() {
  await mongoose.connect(DBURL, { serverSelectionTimeoutMS: 10000 });
  console.log("✅ MongoDB Connected");
  await seedAdmin();
  await seedSampleReviews();
  await mongoose.disconnect();
  console.log("✅ Done.");
}

main().catch((err) => {
  console.error("❌ Seed failed:", err.message);
  process.exit(1);
});
