// Removes duplicate Customer accounts (same email or same phone) so the
// unique indexes defined in models/customer.js can be built.
//
// Usage:
//   node scripts/dedupe-customers.js            # dry run, only reports
//   node scripts/dedupe-customers.js --execute  # deletes duplicates
//
// Keep policy: the OLDEST account (by createdAt, then _id) is kept. Profile
// fields that only exist on a duplicate (e.g. googleId, isVerified) are merged
// into the kept account so no data is lost.
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const mongoose = require("mongoose");
const Customer = require("../models/customer");

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("❌ MONGODB_URI is not set. Copy server/.env.example to server/.env and fill it in.");
  process.exit(1);
}

const EXECUTE = process.argv.includes("--execute");

// Fields worth salvaging from a duplicate into the kept account.
const MERGE_FIELDS = ["googleId", "profilePicture", "isVerified", "isAdmin", "preferredLanguage"];

async function findDuplicateValues(field) {
  const match = field === "phone" ? { phone: { $ne: null } } : {};
  const docs = await Customer.aggregate([
    { $match: match },
    { $group: { _id: `$${field}`, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $sort: { count: -1 } },
  ]);
  return docs.map((d) => d._id);
}

async function handleField(field) {
  const values = await findDuplicateValues(field);
  if (!values.length) {
    console.log(`[${field}] no duplicates found`);
    return { groups: 0, deleted: 0 };
  }

  let deleted = 0;
  for (const value of values) {
    const criteria = { [field]: value };
    const accounts = await Customer.find(criteria).sort({ createdAt: 1, _id: 1 }).exec();
    const keep = accounts[0];
    const dups = accounts.slice(1);

    for (const dup of dups) {
      const updates = {};
      for (const f of MERGE_FIELDS) {
        if (dup[f] && !keep[f]) updates[f] = dup[f];
      }
      if (Object.keys(updates).length) {
        if (EXECUTE) {
          await Customer.updateOne({ _id: keep._id }, { $set: updates });
        }
        console.log(`[${field}] keep ${keep._id} <- merged {${Object.keys(updates).join(", ")}} from ${dup._id}`);
      }
      if (EXECUTE) {
        await Customer.deleteOne({ _id: dup._id });
      }
      deleted += 1;
      console.log(`[${field}] ${EXECUTE ? "DELETED" : "would delete"} ${dup._id} (${value})`);
    }
    console.log(`[${field}] keeping ${keep._id} (${value}), ${dups.length} duplicate(s)`);
  }
  return { groups: values.length, deleted };
}

async function buildIndexes() {
  const collection = Customer.collection;
  if (!EXECUTE) return;

  await collection.createIndex({ email: 1 }, { unique: true, background: true });
  await collection.createIndex({ phone: 1 }, { unique: true, sparse: true, background: true });
  console.log("[indexes] unique email + sparse unique phone indexes ensured");
}

async function main() {
  console.log(`mode: ${EXECUTE ? "EXECUTE (will delete)" : "DRY RUN (no changes)"}`);
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  console.log("connected to MongoDB\n");

  const email = await handleField("email");
  const phone = await handleField("phone");

  await buildIndexes();

  console.log("\nsummary:");
  console.log(`  email groups: ${email.groups}, duplicates removed: ${email.deleted}`);
  console.log(`  phone groups: ${phone.groups}, duplicates removed: ${phone.deleted}`);
  if (!EXECUTE) console.log("\n  run with --execute to apply deletions and build unique indexes");

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});
