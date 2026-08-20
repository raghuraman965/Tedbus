const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("../middleware/auth");

// Live seat-sync + real-time notification bridge. One Socket.IO server attached
// to the same HTTP server that serves the REST API.
//
// - Seat sync: clients "join" a room per (busId, date) and receive only the
//   events that matter to them.
// - Notifications: when a socket authenticates with the JWT in its handshake,
//   it is placed in a `user:<id>` room. Notification delivery then emits a
//   `notification:new` event to that room so the bell/badge updates instantly
//   without any polling.
let io = null;

function roomFor(busId, date) {
  return `bus:${busId}:${date}`;
}

function userRoom(userId) {
  return `user:${userId}`;
}

function initSeatLive(server) {
  if (io) return io;

  const allowedOrigins = (process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  io = new Server(server, {
    cors: {
      origin: allowedOrigins.length > 0 ? allowedOrigins : "*",
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    // Optional authentication via handshake { auth: { token } }. Sockets that
    // do not present a valid token stay unauthenticated and can still use the
    // seat-sync rooms (backward compatible with the existing frontend client).
    const token = socket.handshake.auth && socket.handshake.auth.token;
    if (token) {
      try {
        const payload = jwt.verify(token, JWT_SECRET);
        if (payload && payload.id) {
          socket.data.userId = String(payload.id);
          socket.join(userRoom(socket.data.userId));
        }
      } catch (err) {
        // Invalid/expired token — leave the socket unauthenticated.
      }
    }

    socket.on("bus:join", (payload) => {
      const { busId, date } = payload || {};
      if (!busId || !date) return;
      socket.join(roomFor(String(busId), String(date)));
    });

    socket.on("bus:leave", (payload) => {
      const { busId, date } = payload || {};
      if (!busId || !date) return;
      socket.leave(roomFor(String(busId), String(date)));
    });
  });

  return io;
}

/**
 * Pushes an event to every live socket belonging to a specific user. Used by
 * the notification service to push freshly-created notifications in real time.
 */
function emitToUser(userId, event, payload) {
  if (!io || !userId) return;
  io.to(userRoom(String(userId))).emit(event, payload);
}

/** Pushes a broadcast event to every connected socket. */
function emitBroadcast(event, payload) {
  if (!io) return;
  io.emit(event, payload);
}

/** Pushes just-created seat reservations to everyone watching that bus+date. */
function broadcastSeatsBooked(busId, date, seats) {
  if (!io || !Array.isArray(seats) || seats.length === 0) return;
  io.to(roomFor(busId, date)).emit("seatsBooked", {
    busId: String(busId),
    date: String(date),
    seats: seats.map(Number),
  });
}

/** Pushes released seats (e.g. cancellation) back to watchers. */
function broadcastSeatsReleased(busId, date, seats) {
  if (!io || !Array.isArray(seats) || seats.length === 0) return;
  io.to(roomFor(busId, date)).emit("seatsReleased", {
    busId: String(busId),
    date: String(date),
    seats: seats.map(Number),
  });
}

module.exports = {
  initSeatLive,
  broadcastSeatsBooked,
  broadcastSeatsReleased,
  emitToUser,
  emitBroadcast,
};
