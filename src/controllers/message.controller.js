import messageService from "../services/message.service.js";
import asyncHandler from "../utils/asyncHandler.js";
import { getIo, emitMessage } from "../socket/socket.handler.js";

const messageController = {
  sendMessage: asyncHandler(async (req, res) => {
    const message = await messageService.sendMessage(req.user._id, req.body);

    const io = getIo();
    if (io) {
      const participantIds = message.chat.participants.map((p) => p._id ?? p);
      emitMessage(io, {
        chatId: message.chat._id.toString(),
        senderId: req.user._id.toString(),
        participantIds,
        message,
      });
    }

    res.status(201).json({ success: true, message: "Message sent", data: message });
  }),

  deleteMessage: asyncHandler(async (req, res) => {
    const { deleteFor } = req.body;
    const { message, deleteFor: deletedFor } = await messageService.deleteMessage(
      req.params.messageId,
      req.user._id,
      deleteFor
    );

    const io = getIo();
    if (io && deletedFor === 'everyone') {
      const chatId = message.chat._id?.toString() || message.chat?.toString();
      io.to(chatId).emit('message_deleted', { messageId: message._id, chatId });
    }

    res.status(200).json({ success: true, data: { messageId: message._id, deleteFor: deletedFor } });
  }),

  bulkDeleteMessages: asyncHandler(async (req, res) => {
    const { messageIds, deleteFor } = req.body || {};

    const result = await messageService.bulkDeleteMessages(
      req.user._id,
      { messageIds, deleteFor }
    );

    const io = getIo();
    if (io && deleteFor === 'everyone') {
      for (const [chatId, deletedMessageIds] of Object.entries(result.byChatId)) {
        io.to(chatId).emit('messages_deleted', { chatId, messageIds: deletedMessageIds });
      }
    }

    res.status(200).json({ success: true, data: result });
  }),

  pinMessage: asyncHandler(async (req, res) => {
    const message = await messageService.pinMessage(req.params.messageId, req.user._id);
    const io = getIo();
    if (io) {
      const chatId = message.chat?.toString();
      io.to(chatId).emit('message_pinned', { messageId: message._id, isPinned: message.isPinned, chatId });
    }
    res.status(200).json({ success: true, data: message });
  }),

  starMessage: asyncHandler(async (req, res) => {
    const message = await messageService.starMessage(req.params.messageId, req.user._id);
    res.status(200).json({ success: true, data: message });
  }),

  forwardMessage: asyncHandler(async (req, res) => {
    const { targetChatIds } = req.body;
    const messages = await messageService.forwardMessage(req.params.messageId, req.user._id, targetChatIds);
    const io = getIo();
    if (io) {
      for (const msg of messages) {
        // Populate the message properly
        const populatedMsg = await (await import('../models/Message.model.js')).default
          .findById(msg._id)
          .populate('sender', 'name avatar')
          .populate('forwardedFrom', 'name')
          .populate('forwardedFromChat', 'groupName isGroupChat')
          .populate({
            path: 'chat',
            populate: { path: 'participants', select: 'name avatar' }
          });
        
        if (populatedMsg) {
          const participantIds = populatedMsg.chat.participants.map((p) => p._id.toString());
          emitMessage(io, {
            chatId: populatedMsg.chat._id.toString(),
            senderId: req.user._id.toString(),
            participantIds,
            message: populatedMsg,
          });
        }
      }
    }
    res.status(201).json({ success: true, data: messages });
  }),

  markAsRead: asyncHandler(async (req, res) => {
    const { chatId } = req.params;
    const userId = req.user._id;

    await messageService.markAsRead(userId, chatId);

    const io = getIo();
    if (io) {
      io.to(chatId).emit('messages_read', { chatId, readBy: userId.toString() });
    }

    res.status(200).json({ success: true });
  }),

  getMessages: asyncHandler(async (req, res) => {
    const { page, limit } = req.query;
    const messages = await messageService.getMessages(
      req.user._id,
      req.params.chatId,
      { page: parseInt(page) || 1, limit: parseInt(limit) || 50 }
    );

    res.status(200).json({ success: true, message: "Messages retrieved", data: messages });
  }),

  clearChat: asyncHandler(async (req, res) => {
    const { chatId } = req.params;
    const { clearFor } = req.body;

    const result = await messageService.clearChat(req.user._id, chatId, clearFor);

    const io = getIo();
    if (io && clearFor === 'everyone') {
      io.to(chatId).emit('chat_cleared', { chatId });
    }

    res.status(200).json({ success: true, data: result });
  }),
};

export default messageController;
