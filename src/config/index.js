import dotenv from "dotenv";
dotenv.config();

const config = {
  node_env: process.env.NODE_ENV || "development",
  port: parseInt(process.env.PORT, 10) || 5000,
  db: {
    uri: process.env.MONGO_URI || "mongodb://localhost:27017/realtime-chat",
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || "fallback-access-secret",
    refreshSecret: process.env.JWT_REFRESH_SECRET || "fallback-refresh-secret",
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || "15m",
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d",
  },
  cloudinary: {
    cloudName: process.env.CLOUD_NAME,
    apiKey: process.env.CLOUD_API_KEY,
    apiSecret: process.env.CLOUD_API_SECRET,
  },
  cors: {
    clientUrl: process.env.CLIENT_URL || "http://localhost:5173",
  },
};

export default config;
