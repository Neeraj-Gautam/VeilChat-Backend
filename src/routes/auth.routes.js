import { Router } from "express";
import authController from "../controllers/auth.controller.js";
import protect from "../middlewares/auth.middleware.js";
import validate from "../middlewares/validate.js";
import { registerSchema, loginSchema } from "../validators/auth.validator.js";

const router = Router();

router.post("/register", validate(registerSchema), authController.register);
router.post("/login", validate(loginSchema), authController.login);
router.post("/logout", protect, authController.logout);
router.post("/refresh", authController.refresh);

export default router;
