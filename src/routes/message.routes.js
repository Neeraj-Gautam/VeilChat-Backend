import { Router } from "express";
import messageController from "../controllers/message.controller.js";
import protect from "../middlewares/auth.middleware.js";
import validate from "../middlewares/validate.js";
import { sendMessageSchema } from "../validators/message.validator.js";

const router = Router();

router.use(protect);

router.post("/", validate(sendMessageSchema), messageController.sendMessage);
router.get("/:chatId", messageController.getMessages);
router.put("/:chatId/read", messageController.markAsRead);
router.delete("/:chatId/clear", messageController.clearChat);
router.post("/bulk-delete", messageController.bulkDeleteMessages);
router.delete("/:messageId", messageController.deleteMessage);
router.put("/:messageId/pin", messageController.pinMessage);
router.put("/:messageId/star", messageController.starMessage);
router.post("/:messageId/forward", messageController.forwardMessage);

export default router;
