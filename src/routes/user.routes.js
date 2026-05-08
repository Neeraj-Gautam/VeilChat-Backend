import { Router } from "express";
import userController from "../controllers/user.controller.js";
import protect from "../middlewares/auth.middleware.js";
import { upload } from "../middlewares/upload.js";

const router = Router();

router.get("/", protect, userController.getUsers);
router.put("/profile-picture", protect, upload.single("avatar"), userController.updateProfilePicture);
router.delete("/account", protect, userController.deleteAccount);

export default router;
