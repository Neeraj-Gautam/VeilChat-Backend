import mongoose from "mongoose";
import config from "./index.js";

const connectDB = async () => {
  try {
    console.log("🔄  Attempting to connect to MongoDB...");
    console.log(`📍  Connection URI: ${config.db.uri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@')}`);
    
    const conn = await mongoose.connect(config.db.uri, {
      serverSelectionTimeoutMS: 30000, // 30 second timeout
      socketTimeoutMS: 45000,
    });
    
    console.log(`✅  MongoDB connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`⛔  MongoDB connection error: ${error.message}`);
    console.error(`⛔  Full error:`, error);
    process.exit(1);
  }
};

export default connectDB;
