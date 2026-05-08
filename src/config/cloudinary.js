import { v2 as cloudinary } from "cloudinary";

// Note: dotenv is already configured in config/index.js
// We rely on that being imported first

cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_API_KEY,
  api_secret: process.env.CLOUD_API_SECRET,
});

// Verify configuration
const config = cloudinary.config();
console.log("Cloudinary configured:", {
  cloud_name: config.cloud_name || "✗ missing",
  api_key: config.api_key ? "✓ loaded" : "✗ missing",
  api_secret: config.api_secret ? "✓ loaded" : "✗ missing",
});

if (!config.cloud_name || !config.api_key || !config.api_secret) {
  console.error("⚠️  WARNING: Cloudinary credentials are missing!");
  console.error("Environment variables:", {
    CLOUD_NAME: process.env.CLOUD_NAME,
    CLOUD_API_KEY: process.env.CLOUD_API_KEY,
    CLOUD_API_SECRET: process.env.CLOUD_API_SECRET ? "exists" : "missing",
  });
}

export default cloudinary;
