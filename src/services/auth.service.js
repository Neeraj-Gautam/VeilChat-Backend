import jwt from "jsonwebtoken";
import User from "../models/User.model.js";
import ApiError from "../utils/ApiError.js";
import config from "../config/index.js";

/**
 * Generates an access token (short-lived).
 */
const generateAccessToken = (userId) => {
  return jwt.sign({ id: userId }, config.jwt.accessSecret, {
    expiresIn: config.jwt.accessExpiresIn,
  });
};

/**
 * Generates a refresh token (long-lived).
 */
const generateRefreshToken = (userId) => {
  return jwt.sign({ id: userId }, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshExpiresIn,
  });
};

/**
 * Generates both tokens and persists the refresh token on the user document.
 */
const generateTokens = async (userId) => {
  const accessToken = generateAccessToken(userId);
  const refreshToken = generateRefreshToken(userId);

  // Store hashed refresh token on the user for server-side invalidation
  await User.findByIdAndUpdate(userId, { refreshToken });

  return { accessToken, refreshToken };
};

const authService = {
  /**
   * Register a new user.
   */
  async register({ name, email, password }) {
    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      throw ApiError.badRequest("Email is already registered");
    }

    // Create user (password hashed via pre-save hook)
    const user = await User.create({ name, email, password });

    // Generate tokens
    const { accessToken, refreshToken } = await generateTokens(user._id);

    // Return user data (without password)
    const userData = {
      _id: user._id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      createdAt: user.createdAt,
    };

    return { user: userData, accessToken, refreshToken };
  },

  /**
   * Login an existing user.
   */
  async login({ email, password }) {
    // Find user and explicitly select password field
    const user = await User.findOne({ email }).select("+password");
    if (!user) {
      throw ApiError.unauthorized("Invalid email or password");
    }

    // Verify password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      throw ApiError.unauthorized("Invalid email or password");
    }

    // Generate tokens
    const { accessToken, refreshToken } = await generateTokens(user._id);

    const userData = {
      _id: user._id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      createdAt: user.createdAt,
    };

    return { user: userData, accessToken, refreshToken };
  },

  /**
   * Logout — clear the refresh token from the user document.
   */
  async logout(userId) {
    await User.findByIdAndUpdate(userId, { refreshToken: "" });
  },

  /**
   * Refresh the access token using a valid refresh token.
   */
  async refreshAccessToken(incomingRefreshToken) {
    if (!incomingRefreshToken) {
      throw ApiError.unauthorized("Refresh token is required");
    }

    // Verify the refresh token
    let decoded;
    try {
      decoded = jwt.verify(incomingRefreshToken, config.jwt.refreshSecret);
    } catch {
      throw ApiError.unauthorized("Invalid or expired refresh token");
    }

    // Find user and check stored refresh token matches
    const user = await User.findById(decoded.id).select("+refreshToken");
    if (!user || user.refreshToken !== incomingRefreshToken) {
      throw ApiError.unauthorized("Refresh token is invalid or has been revoked");
    }

    // Rotate tokens (issue new pair, invalidate old refresh token)
    const { accessToken, refreshToken } = await generateTokens(user._id);

    const userData = {
      _id: user._id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      createdAt: user.createdAt,
    };

    return { accessToken, refreshToken, user: userData };
  },
};

export default authService;
