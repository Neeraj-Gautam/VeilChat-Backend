import authService from "../services/auth.service.js";
import asyncHandler from "../utils/asyncHandler.js";

// Cookie options for the refresh token
const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "none" : "lax", // "none" for cross-origin in production
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: "/",
};

const authController = {
  /**
   * POST /api/auth/register
   */
  register: asyncHandler(async (req, res) => {
    const { user, accessToken, refreshToken } = await authService.register(req.body);

    res
      .status(201)
      .cookie("refreshToken", refreshToken, REFRESH_COOKIE_OPTIONS)
      .json({
        success: true,
        message: "User registered successfully",
        data: { user, accessToken, refreshToken }, // Send refreshToken in response as fallback
      });
  }),

  /**
   * POST /api/auth/login
   */
  login: asyncHandler(async (req, res) => {
    const { user, accessToken, refreshToken } = await authService.login(req.body);

    res
      .status(200)
      .cookie("refreshToken", refreshToken, REFRESH_COOKIE_OPTIONS)
      .json({
        success: true,
        message: "Logged in successfully",
        data: { user, accessToken, refreshToken }, // Send refreshToken in response as fallback
      });
  }),

  /**
   * POST /api/auth/logout
   */
  logout: asyncHandler(async (req, res) => {
    await authService.logout(req.user._id);

    res
      .status(200)
      .clearCookie("refreshToken", REFRESH_COOKIE_OPTIONS)
      .json({
        success: true,
        message: "Logged out successfully",
      });
  }),

  /**
   * POST /api/auth/refresh
   */
  refresh: asyncHandler(async (req, res) => {
    // Try cookie first, then body as fallback
    const incomingRefreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

    const { accessToken, refreshToken, user } =
      await authService.refreshAccessToken(incomingRefreshToken);

    res
      .status(200)
      .cookie("refreshToken", refreshToken, REFRESH_COOKIE_OPTIONS)
      .json({
        success: true,
        data: { accessToken, user, refreshToken }, // Send refreshToken in response as fallback
      });
  }),
};

export default authController;
