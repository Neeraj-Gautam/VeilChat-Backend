import chatService from "../services/chat.service.js";
import asyncHandler from "../utils/asyncHandler.js";
import cloudinary from "../config/cloudinary.js";
import ApiError from "../utils/ApiError.js";
import Chat from "../models/Chat.model.js";
import { getIo, emitToUser } from "../socket/socket.handler.js";

const chatController = {
  /**
   * POST /api/chat
   * Access or create a 1-to-1 chat with another user.
   * Body: { userId }
   */
  accessChat: asyncHandler(async (req, res) => {
    const { userId } = req.body;
    const { chat, created } = await chatService.accessOneToOneChat(
      req.user._id,
      userId
    );

    res.status(created ? 201 : 200).json({
      success: true,
      message: created ? "Chat created" : "Chat retrieved",
      data: chat,
    });
  }),

  /**
   * POST /api/chat/group
   * Create a new group chat.
   * Body: { groupName, participants: [userId, ...] }
   */
  createGroup: asyncHandler(async (req, res) => {
    const chat = await chatService.createGroupChat(req.user._id, req.body);

    res.status(201).json({
      success: true,
      message: "Group chat created",
      data: chat,
    });
  }),

  /**
   * PUT /api/chat/:chatId/members
   * Add members to group (admin only).
   */
  addMembers: asyncHandler(async (req, res) => {
    const chat = await chatService.addMembers(req.params.chatId, req.user._id, req.body.userIds);
    res.status(200).json({ success: true, message: "Members added", data: chat });
  }),

  /**
   * DELETE /api/chat/:chatId/members/:userId
   * Remove a member (admin only).
   */
  removeMember: asyncHandler(async (req, res) => {
    const chat = await chatService.removeMember(req.params.chatId, req.user._id, req.params.userId);
    res.status(200).json({ success: true, message: "Member removed", data: chat });
  }),

  /**
   * DELETE /api/chat/:chatId/leave
   * Leave a group.
   */
  leaveGroup: asyncHandler(async (req, res) => {
    await chatService.leaveGroup(req.params.chatId, req.user._id);
    res.status(200).json({ success: true, message: "Left group" });
  }),

  /**
   * PUT /api/chat/:chatId
   * Update group name (admin only).
   */
  updateGroup: asyncHandler(async (req, res) => {
    const chat = await chatService.updateGroup(req.params.chatId, req.user._id, req.body);
    res.status(200).json({ success: true, message: "Group updated", data: chat });
  }),

  /**
   * PUT /api/chat/:chatId/admin
   * Transfer admin role.
   */
  transferAdmin: asyncHandler(async (req, res) => {
    const chat = await chatService.transferAdmin(req.params.chatId, req.user._id, req.body.userId);
    res.status(200).json({ success: true, message: "Admin transferred", data: chat });
  }),
  getChats: asyncHandler(async (req, res) => {
    const chats = await chatService.getUserChats(req.user._id);

    res.status(200).json({
      success: true,
      message: "Chats retrieved",
      data: chats,
    });
  }),

  /**
   * PUT /api/chat/:chatId/pin
   * Pin/Unpin a chat for the current user.
   */
  togglePinChat: asyncHandler(async (req, res) => {
    const chat = await chatService.togglePinChat(req.params.chatId, req.user._id);
    res.status(200).json({ success: true, message: "Chat pin toggled", data: chat });
  }),

  /**
   * PUT /api/chat/:chatId/avatar
   * Update group avatar (admin/owner only).
   */
  updateGroupAvatar: asyncHandler(async (req, res) => {
    if (!req.file) {
      throw ApiError.badRequest("No image file provided");
    }

    const chat = await Chat.findById(req.params.chatId);
    if (!chat) {
      throw ApiError.notFound("Chat not found");
    }

    if (!chat.isGroupChat) {
      throw ApiError.badRequest("Cannot update avatar for non-group chats");
    }

    // Check if user is admin or owner
    const isOwner = chat.admin?.toString() === req.user._id.toString();
    const isPromotedAdmin = (chat.admins || []).some((a) => a.toString() === req.user._id.toString());
    
    if (!isOwner && !isPromotedAdmin) {
      throw ApiError.forbidden("Only group admins can update group avatar");
    }

    // Delete old avatar from Cloudinary if exists
    if (chat.groupAvatar) {
      try {
        const urlParts = chat.groupAvatar.split('/');
        const filename = urlParts[urlParts.length - 1];
        const publicId = `chat-app/${filename.split('.')[0]}`;
        await cloudinary.uploader.destroy(publicId, { resource_type: "image" });
      } catch (error) {
        console.error("Failed to delete old group avatar:", error);
      }
    }

    // Update group avatar
    chat.groupAvatar = req.file.path;
    await chat.save();

    // Emit socket event to all participants individually (not just room members)
    const io = getIo();
    if (io) {
      chat.participants.forEach((participantId) => {
        emitToUser(io, participantId, 'group_avatar_updated', {
          chatId: chat._id.toString(),
          groupAvatar: chat.groupAvatar,
        });
      });
    }

    res.status(200).json({
      success: true,
      message: "Group avatar updated successfully",
      data: chat,
    });
  }),
};

export default chatController;
