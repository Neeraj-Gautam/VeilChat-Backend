import multer from "multer";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import cloudinary from "../config/cloudinary.js";

const ALLOWED_MIME_TYPES = new Set([
  // images
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",

  // pdf
  "application/pdf",

  // Word
  "application/msword", // .doc
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
]);

const storage = new CloudinaryStorage({
  cloudinary,
  params: (req, file) => {
    const isImage = file.mimetype?.startsWith("image/");

    // Cloudinary treats most non-images (pdf, doc, docx, etc.) as "raw".
    // Using resource_type="auto" can reject some office formats.
    return {
      folder: "chat-app",
      // For non-images, Cloudinary may detect formats like "zip" for .docx (it's a zip container).
      // So don't hard-restrict allowed_formats here; validate at multer layer instead.
      ...(isImage ? { allowed_formats: ["jpg", "jpeg", "png", "gif", "webp"] } : {}),
      resource_type: isImage ? "image" : "raw",
    };
  },
});

export const upload = multer({ 
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) return cb(null, true);
    return cb(new multer.MulterError("LIMIT_UNEXPECTED_FILE", "file"));
  },
});
