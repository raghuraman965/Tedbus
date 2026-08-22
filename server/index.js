const express=require('express')
const bodyparser=require('body-parser')
const cors =require('cors')
const helmet=require('helmet')
const rateLimit=require('express-rate-limit')
const mongoose=require('mongoose')
const http = require('http')
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '.env') })

const app=express();

// Security headers
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false,
}));

// CORS — restrict to same-origin in production, allow configured origins.
// In development, automatically allow the Angular dev server origins.
const devOrigins = [
  'http://localhost:4200',
  'http://127.0.0.1:4200',
  'http://localhost:5000',
  'http://127.0.0.1:5000',
];
const envOrigins = (process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
const allowedOrigins = envOrigins.length > 0
  ? envOrigins
  : (process.env.NODE_ENV === 'production' ? [] : devOrigins);

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

// Rate limiting — global baseline
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
}));

app.use(bodyparser.json({ limit: '2mb' }))
const customerroutes=require("./routes/customer");
const routesroute=require("./routes/route");
const bookingroute=require("./routes/booking")
const authroutes=require("./routes/auth")
const communityroutes=require("./routes/community")
const paymentsettingsroute=require("./routes/paymentSettings")
const notificationroute=require("./routes/notification")
const routeplannerroute=require("./routes/routePlanner")
const userPreferenceroute=require("./routes/userPreference")
const adminauthroute=require("./routes/adminAuth")
const adminroute=require("./routes/admin")
const profileroute=require("./routes/profile")
const searchroute=require("./routes/search")
const offerRoutes=require("./routes/offer")
const reviewRoutes=require("./routes/review")
const trackingRoutes=require("./routes/tracking")
const verificationRoutes=require("./routes/verification")
app.use(trackingRoutes)
app.use(verificationRoutes)
app.use(profileroute)
app.use(bookingroute)
app.use(routesroute)
app.use(searchroute)
app.use(customerroutes)
app.use(authroutes)
app.use(communityroutes)
app.use(paymentsettingsroute)
app.use(notificationroute)
app.use(routeplannerroute)
app.use(userPreferenceroute)
app.use(offerRoutes)
app.use(reviewRoutes)
app.use(adminauthroute)
app.use(adminroute)

app.use('/uploads', express.static(path.join(__dirname, 'uploads')))

// --- Serve the Angular build (production) --------------------------------
// After `ng build`, the SPA lives in dist/frontend/browser/.  In dev mode
// the Angular CLI dev server (ng serve) runs on port 4200 and proxies API
// calls; in production the Express server itself hosts the built files so
// service-worker registration, push-subscriptionchange re-subscribe, and
// all other SW-served assets work without a separate proxy.
const fs = require('fs');

const possibleDistDirs = [
  path.join(__dirname, '..', 'dist', 'frontend', 'browser'),
  path.join(__dirname, '..', 'frontend', 'dist', 'frontend', 'browser'),
];
let DIST_DIR = path.join(__dirname, '../dist/frontend');

DIST_DIR = possibleDistDirs.find(dir => fs.existsSync(dir));


console.log('📁 Angular DIST_DIR:', DIST_DIR || 'NOT FOUND');

if (DIST_DIR) {
  app.use(express.static(DIST_DIR, {
    maxAge: '1d',
    index: false,
  }));
} else {
  console.error('❌ Angular build directory not found');
}

const DBURL = process.env.MONGODB_URI;
if (!DBURL) {
  console.error("❌ MONGODB_URI is not set. Copy server/.env.example to server/.env and fill it in (see server/.env.example).");
  process.exit(1);
}
mongoose
  .connect(DBURL, {
    serverSelectionTimeoutMS: 10000,
  })
  .then(async () => {
    console.log("✅ MongoDB Connected Successfully");
    // Sync model indexes (e.g. the unique bookingId index on reviews) so the
    // "one review per completed journey" rule is enforced at the DB level.
    try {
      const Review = require("./models/review");
      await Review.syncIndexes();
      console.log("✅ Review indexes synced");
    } catch (idxErr) {
      console.error("❌ Review index sync failed:", idxErr.message);
    }
  })
  .catch((err) => {
    console.error("❌ Full MongoDB Error:");
    console.error(err);
  });

// API health-check (dev convenience)
app.get('/api/health', (req, res) => res.json({ ok: true, timestamp: Date.now() }));

// Angular SPA catch-all: every GET that wasn't matched by an API route or
// static file is served index.html so Angular's router handles the path.
app.get('*', (req, res) => {
  if (DIST_DIR) {
    const indexPath = path.join(DIST_DIR, 'index.html');

    if (fs.existsSync(indexPath)) {
      return res.sendFile(indexPath);
    }
  }

  res.send('Hello, TedBus is working');
});

const PORT = process.env.PORT || 5000
const server = http.createServer(app)
const { initSeatLive } = require("./services/socket")
initSeatLive(server)
server.listen(PORT,()=>{
    console.log(`server is running on port ${PORT}`)
})

const notificationService = require("./services/notificationService");

let reminderTimer = null;
let reminderRunning = false;

async function runNotificationSweep() {
  if (reminderRunning) return;
  reminderRunning = true;
  try {
    await notificationService.sendTripReminders();
    await notificationService.retryFailedChannels();
  } catch (err) {
    console.error("[notifications] scheduler error:", err.message);
  } finally {
    reminderRunning = false;
  }
}

function startNotificationScheduler() {
  if (reminderTimer) return;
  console.log("[notifications] Scheduler started (5-tier trip reminders + failed-channel retries, every 10 minutes).");
  runNotificationSweep();
  reminderTimer = setInterval(runNotificationSweep, 10 * 60 * 1000);
}

if (process.env.NODE_ENV !== "test") {
  startNotificationScheduler();
}

// ---------------------------------------------------------------------------
// Seat-hold expiry sweeper. Temporary seat holds created on "Proceed to
// Booking" must disappear automatically when payment is abandoned, otherwise
// seats would stay invisible to everyone until manual cleanup. Availability
// checks already ignore expired holds lazily; this sweeper physically removes
// them so the documents stay small.
// ---------------------------------------------------------------------------
const { sweepExpiredHolds } = require("./controller/seatReservation");

let holdSweepTimer = null;
function startHoldSweeper() {
  if (holdSweepTimer) return;
  holdSweepTimer = setInterval(async () => {
    try {
      const removed = await sweepExpiredHolds();
      if (removed > 0) console.log(`[seat-holds] swept ${removed} expired hold(s)`);
    } catch (err) {
      console.error("[seat-holds] sweep error:", err.message);
    }
  }, 60 * 1000);
  console.log("[seat-holds] Expiry sweeper started (every 60s).");
}

mongoose.connection.once("open", () => {
  if (process.env.NODE_ENV !== "test") startHoldSweeper();
});
