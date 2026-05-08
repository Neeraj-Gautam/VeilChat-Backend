import { Router } from "express";
import healthRoutes from "./health.routes.js";
import authRoutes from "./auth.routes.js";
import chatRoutes from "./chat.routes.js";
import messageRoutes from "./message.routes.js";
import userRoutes from "./user.routes.js";
import uploadRoutes from "./upload.routes.js";

const router = Router();

// ── Route Groups ──────────────────────────────────────────
router.use("/health", healthRoutes);
router.use("/auth", authRoutes);
router.use("/chat", chatRoutes);
router.use("/message", messageRoutes);
router.use("/user", userRoutes);
router.use("/upload", uploadRoutes);

export default router;
