import "dotenv/config";
import http from "http";
import { Server } from "socket.io";
import app from "./app.js";
import config from "./config/index.js";
import connectDB from "./config/db.js";
import { initSocket } from "./socket/socket.handler.js";

const { port, node_env } = config;

// Connect to MongoDB, then start the server
const startServer = async () => {
  await connectDB();

  const httpServer = http.createServer(app);

  const io = new Server(httpServer, {
    cors: {
      origin: config.cors.clientUrl,
      methods: ["GET", "POST"],
      credentials: true,
    },
    pingTimeout: 60000,
  });

  initSocket(io);

  const server = httpServer.listen(port, () => {
    console.log(`\n🚀  Server running in ${node_env} mode on port ${port}`);
    console.log(`📡  Health check → http://localhost:${port}/api/health\n`);
  });

  return server;
};

const server = await startServer();

// ── Graceful Shutdown ─────────────────────────────────────
const shutdown = (signal) => {
  console.log(`\n⚡  ${signal} received — shutting down gracefully…`);
  server.close(() => {
    console.log("✅  Server closed.");
    process.exit(0);
  });

  // Force-kill after 10 seconds if shutdown hangs
  setTimeout(() => {
    console.error("⛔  Forcefully terminating — shutdown timed out.");
    process.exit(1);
  }, 10_000);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// ── Unhandled Errors ──────────────────────────────────────
process.on("unhandledRejection", (reason) => {
  console.error("UNHANDLED REJECTION:", reason);
  shutdown("unhandledRejection");
});

process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err);
  shutdown("uncaughtException");
});
