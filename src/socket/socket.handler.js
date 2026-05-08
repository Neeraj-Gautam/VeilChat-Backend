import jwt from "jsonwebtoken";
import Chat from "../models/Chat.model.js";
import config from "../config/index.js";

// userId (string) → Set<socketId>
const userSocketMap = new Map();

// ── Auth Middleware ────────────────────────────────────────
const socketAuthMiddleware = (socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error("Authentication token missing"));

  try {
    const decoded = jwt.verify(token, config.jwt.accessSecret);
    socket.userId = decoded.id;
    next();
  } catch {
    next(new Error("Invalid or expired token"));
  }
};

// ── Delivery Helpers ───────────────────────────────────────

/**
 * Emit to all sockets of a specific user (multi-device).
 */
const emitToUser = (io, userId, event, data) => {
  const sockets = userSocketMap.get(userId.toString());
  sockets?.forEach((socketId) => io.to(socketId).emit(event, data));
};

/**
 * Emit message to a chat room + fallback to direct user sockets.
 * Skips direct emit for users already in the room to prevent duplicates.
 *
 * @param {object} io        - Socket.IO server instance
 * @param {string} chatId    - Chat room ID
 * @param {string} senderId  - Sender's userId (excluded from emission)
 * @param {string[]} participantIds - All participant userIds in the chat
 * @param {object} message   - Fully populated message object from REST
 */
const emitMessage = (io, { chatId, senderId, participantIds, message }) => {
  // Get all socketIds currently in the chat room
  const roomSockets = io.sockets.adapter.rooms.get(chatId) ?? new Set();

  participantIds.forEach((pid) => {
    const pidStr = pid.toString();
    if (pidStr === senderId.toString()) return; // never echo to sender

    const userSockets = userSocketMap.get(pidStr);
    if (!userSockets) return; // user is offline

    userSockets.forEach((socketId) => {
      if (roomSockets.has(socketId)) {
        // User is in the room — room emission handles it, skip direct
        return;
      }
      // User is online but not in the room — deliver directly
      io.to(socketId).emit("receive_message", message);
    });
  });

  // Emit to room (covers all sockets that joined via join_chat)
  io.to(chatId).except(senderId).emit("receive_message", message);
};

// ── Socket Init ────────────────────────────────────────────
let _io = null;

const initSocket = (io) => {
  _io = io;
  io.use(socketAuthMiddleware);

  io.on("connection", (socket) => {
    const userId = socket.userId;

    // Register socket
    if (!userSocketMap.has(userId)) {
      userSocketMap.set(userId, new Set());
    }
    userSocketMap.get(userId).add(socket.id);
    socket.join(userId);
    socket.emit("connected");

    // Notify others only on first session (not on additional tabs)
    if (userSocketMap.get(userId).size === 1) {
      io.emit("user_online", userId);
    }

    // Send currently online users to the newly connected socket
    const onlineUserIds = [...userSocketMap.keys()]
    socket.emit("online_users", onlineUserIds);

    console.log(`🟢  User connected: ${userId} (socket: ${socket.id}) [${userSocketMap.get(userId).size} session(s)]`);

    // ── Join Chat Room ─────────────────────────────────
    socket.on("join_chat", async (chatId) => {
      if (!chatId) return;
      try {
        const chat = await Chat.findOne({ _id: chatId, participants: userId });
        if (!chat) {
          socket.emit("error", { message: "Access denied to this chat" });
          return;
        }
        socket.join(chatId);
      } catch {
        socket.emit("error", { message: "Failed to join chat" });
      }
    });

    // ── Typing Indicators ──────────────────────────────
    socket.on("typing", async ({ chatId }) => {
      if (!chatId) return;
      // Emit to room AND directly to all participants as fallback
      try {
        const chat = await Chat.findOne({ _id: chatId, participants: userId }).select("participants");
        if (!chat) return;
        chat.participants.forEach((pid) => {
          const pidStr = pid.toString();
          if (pidStr === userId) return;
          const sockets = userSocketMap.get(pidStr);
          sockets?.forEach((socketId) => {
            io.to(socketId).emit("typing", { chatId, userId });
          });
        });
      } catch { /* ignore */ }
    });

    socket.on("stop_typing", async ({ chatId }) => {
      if (!chatId) return;
      try {
        const chat = await Chat.findOne({ _id: chatId, participants: userId }).select("participants");
        if (!chat) return;
        chat.participants.forEach((pid) => {
          const pidStr = pid.toString();
          if (pidStr === userId) return;
          const sockets = userSocketMap.get(pidStr);
          sockets?.forEach((socketId) => {
            io.to(socketId).emit("stop_typing", { chatId, userId });
          });
        });
      } catch { /* ignore */ }
    });

    // ── Disconnect ─────────────────────────────────────
    socket.on("disconnect", () => {
      const sockets = userSocketMap.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          userSocketMap.delete(userId);
          io.emit("user_offline", userId);
          console.log(`🔴  User fully disconnected: ${userId}`);
        } else {
          console.log(`🟡  User ${userId} still has ${sockets.size} session(s)`);
        }
      }
    });
  });
};

const getIo = () => _io;
const getSocketIds = (userId) => userSocketMap.get(userId) ?? new Set();

export { initSocket, getIo, getSocketIds, emitToUser, emitMessage };
