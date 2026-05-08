import { Router } from "express";
import chatController from "../controllers/chat.controller.js";
import protect from "../middlewares/auth.middleware.js";
import validate from "../middlewares/validate.js";
import { accessChatSchema, createGroupSchema } from "../validators/chat.validator.js";
import { upload } from "../middlewares/upload.js";

const router = Router();
router.use(protect);

router.route("/")
  .get(chatController.getChats)
  .post(validate(accessChatSchema), chatController.accessChat);

router.post("/group", validate(createGroupSchema), chatController.createGroup);
router.put("/:chatId", chatController.updateGroup);
router.put("/:chatId/avatar", upload.single("avatar"), chatController.updateGroupAvatar);
router.put("/:chatId/pin", chatController.togglePinChat);
router.put("/:chatId/members", chatController.addMembers);
router.put("/:chatId/admin", chatController.transferAdmin);
router.delete("/:chatId/members/:userId", chatController.removeMember);
router.delete("/:chatId/leave", chatController.leaveGroup);

export default router;
