import mongoose from "mongoose";
import config from "./index.js";

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(config.db.uri);
    console.log(`✅  MongoDB connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`⛔  MongoDB connection error: ${error.message}`);
    process.exit(1);
  }
};

export default connectDB;
