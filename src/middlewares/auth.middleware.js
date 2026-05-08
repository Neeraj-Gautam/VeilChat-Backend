import jwt from "jsonwebtoken";
import User from "../models/User.model.js";
import ApiError from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import config from "../config/index.js";

/**
 * Protects routes — verifies the access token from the
 * Authorization header and attaches the user to req.user.
 *
 * Usage:
 *   router.get("/profile", protect, controller.getProfile);
 */
const protect = asyncHandler(async (req, _res, next) => {
  // 1. Extract token from "Bearer <token>"
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    throw ApiError.unauthorized("Access token is missing");
  }

  const token = authHeader.split(" ")[1];

  // 2. Verify token
  let decoded;
  try {
    decoded = jwt.verify(token, config.jwt.accessSecret);
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      throw ApiError.unauthorized("Access token has expired");
    }
    throw ApiError.unauthorized("Invalid access token");
  }

  // 3. Check if user still exists
  const user = await User.findById(decoded.id);
  if (!user) {
    throw ApiError.unauthorized("User no longer exists");
  }

  // 4. Attach user to request
  req.user = user;
  next();
});

export default protect;
