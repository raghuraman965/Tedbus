const express=require('express')
const bodyparser=require('body-parser')
const cors =require('cors')
const mongoose=require('mongoose')
const http = require('http')
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '.env') })

const app=express();

app.use(cors());
app.use(bodyparser.json({ limit: '10mb' }))
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
app.use(bookingroute)
app.use(routesroute)
app.use(customerroutes)
app.use(authroutes)
app.use(communityroutes)
app.use(paymentsettingsroute)
app.use(notificationroute)
app.use(routeplannerroute)
app.use(userPreferenceroute)
app.use(adminauthroute)
app.use(adminroute)

app.use('/uploads', express.static(path.join(__dirname, 'uploads')))

const DBURL = process.env.MONGODB_URI;
if (!DBURL) {
  console.error("❌ MONGODB_URI is not set. Copy server/.env.example to server/.env and fill it in (see server/.env.example).");
  process.exit(1);
}
mongoose
  .connect(DBURL, {
    serverSelectionTimeoutMS: 10000,
  })
  .then(() => {
    console.log("âœ… MongoDB Connected Successfully");
  })
  .catch((err) => {
    console.error("âŒ Full MongoDB Error:");
    console.error(err);
  });

app.get('/',(req,res)=>{
    res.send('Hello , Ted bus is working')
})

const PORT = process.env.PORT || 5050
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
    await notificationService.sendJourneyReminders();
    await notificationService.retryFailedChannels();
  } catch (err) {
    console.error("[notifications] journey reminder/retry error:", err.message);
  } finally {
    reminderRunning = false;
  }
}

function startNotificationScheduler() {
  if (reminderTimer) return;
  console.log("[notifications] Notification scheduler started (journey reminders + failed-channel retries, every 10 minutes).");
  runNotificationSweep();
  reminderTimer = setInterval(runNotificationSweep, 10 * 60 * 1000);
}

if (process.env.NODE_ENV !== "test") {
  startNotificationScheduler();
}

