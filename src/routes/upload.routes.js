import { Router } from "express";
import { upload } from "../middlewares/upload.js";
import protect from "../middlewares/auth.middleware.js";
import asyncHandler from "../utils/asyncHandler.js";

const router = Router();
router.use(protect);

const getFileType = (mimetype = "") => {
  if (mimetype.startsWith("image/")) return "image";
  if (mimetype.startsWith("video/")) return "video";
  if (mimetype.startsWith("audio/")) return "audio";
  if (mimetype === "application/pdf") return "pdf";
  if (
    mimetype.includes("document") ||
    mimetype.includes("word") ||
    mimetype.includes("sheet") ||
    mimetype.includes("msword") ||
    mimetype.includes("officedocument")
  ) {
    return "document";
  }
  return "file";
};

router.post(
  "/",
  // Support both: legacy single "file" and new multi "files"
  upload.fields([
    { name: "file", maxCount: 1 },
    { name: "files", maxCount: 10 },
  ]),
  asyncHandler(async (req, res) => {
    const files = [
      ...((req.files?.file || []) ?? []),
      ...((req.files?.files || []) ?? []),
    ];

    if (!files.length) {
      return res.status(400).json({ success: false, message: "No file uploaded" });
    }

    res.json({
      success: true,
      data: files.map((f) => ({
        url: f.path,
        public_id: f.filename, // Cloudinary public_id
        type: getFileType(f.mimetype),
        name: f.originalname,
        size: f.size,
      })),
    });
  })
);

// Error handling middleware for multer errors
router.use((err, req, res, next) => {
  console.error('Upload error:', err);
  if (err.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, message: 'File too large. Maximum size is 10MB.' });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ success: false, message: 'File type not allowed.' });
    }
    return res.status(400).json({ success: false, message: err.message });
  }
  return res.status(400).json({ success: false, message: err.message || 'Upload failed' });
});

export default router;
