import Message from "../models/Message.model.js";
import Chat from "../models/Chat.model.js";
import ApiError from "../utils/ApiError.js";
import cloudinary from "../config/cloudinary.js";

const SENDER_POPULATE = { path: "sender", select: "name avatar" };
const FORWARDED_FROM_POPULATE = { path: "forwardedFrom", select: "name" };
const FORWARDED_FROM_CHAT_POPULATE = { path: "forwardedFromChat", select: "groupName isGroupChat" };
const REPLY_TO_POPULATE = { path: "replyTo", select: "content sender", populate: { path: "sender", select: "name" } };
const CHAT_POPULATE = {
  path: "chat",
  populate: { path: "participants", select: "name avatar" },
};

const messageService = {
  /**
   * Send a message to a chat.
   * Updates the chat's lastMessage after creation.
   */
  async sendMessage(senderId, { chatId, content, attachments = [], type = "text" }) {
    // Verify sender is a participant
    const chat = await Chat.findOne({
      _id: chatId,
      participants: senderId,
    });
    if (!chat) {
      throw ApiError.notFound("Chat not found or access denied");
    }

    // Warn if attachments are missing public_id (for monitoring)
    if (attachments.length > 0) {
      attachments.forEach((att, idx) => {
        if (!att.public_id) {
          console.warn(`⚠️  Attachment ${idx} missing public_id - file cannot be deleted from Cloudinary later`);
        }
      });
    }

    const message = await Message.create({
      sender: senderId,
      chat: chatId,
      content,
      attachments,
      type,
    });

    // Update chat's lastMessage
    await Chat.findByIdAndUpdate(chatId, { lastMessage: message._id });

    return message.populate([SENDER_POPULATE, CHAT_POPULATE, FORWARDED_FROM_POPULATE, FORWARDED_FROM_CHAT_POPULATE, REPLY_TO_POPULATE]);
  },

  /**
   * Helper: Map attachment type to Cloudinary resource_type
   */
  _getCloudinaryResourceType(attachmentType) {
    const typeMap = {
      image: "image",
      video: "video",
      audio: "video", // Cloudinary treats audio as video
      pdf: "raw",
      document: "raw",
      other: "raw",
    };
    return typeMap[attachmentType] || "raw";
  },

  /**
   * Helper: Delete file from Cloudinary with proper error handling
   */
  async _deleteFromCloudinary(publicId, attachmentType) {
    try {
      const resourceType = this._getCloudinaryResourceType(attachmentType);
      const result = await cloudinary.uploader.destroy(publicId, {
        resource_type: resourceType,
      });

      // Handle different result statuses
      if (result.result === "ok") {
        console.log(`✅ Deleted from Cloudinary: ${publicId} (${resourceType})`);
        return { success: true, publicId };
      } else if (result.result === "not found") {
        // File already deleted or never existed - not an error
        console.log(`⚠️  File not found in Cloudinary (already deleted?): ${publicId}`);
        return { success: true, publicId, alreadyDeleted: true };
      } else {
        console.error(`❌ Unexpected Cloudinary response for ${publicId}:`, result);
        return { success: false, publicId, error: result };
      }
    } catch (error) {
      console.error(`❌ Failed to delete from Cloudinary: ${publicId}`, error.message);
      return { success: false, publicId, error: error.message };
    }
  },

  /**
   * Delete a message.
   * deleteFor: 'me' | 'everyone'
   * - 'me': adds userId to deletedFor array (soft delete for one user) - NO file deletion
   * - 'everyone': sets isDeleted = true (hard soft-delete for all) + deletes files from Cloudinary
   * Rules:
   * - Any user can delete for themselves
   * - Own message: can delete for everyone
   * - Group admin/owner: can delete anyone's message for everyone
   * - 1-to-1: sender can delete for everyone
   */
  async deleteMessage(messageId, userId, deleteFor) {
    const message = await Message.findById(messageId).populate('chat');
    if (!message) throw ApiError.notFound('Message not found');

    const chat = message.chat;
    const isParticipant = (chat.participants || []).some(
      (p) => (p?._id || p)?.toString() === userId.toString()
    );
    if (!isParticipant) {
      throw ApiError.notFound('Message not found');
    }

    const isOwner = chat.admin?.toString() === userId.toString();
    const isPromotedAdmin = (chat.admins || []).some((a) => a.toString() === userId.toString());
    const isGroupAdmin = isOwner || isPromotedAdmin;
    const isSender = message.sender?.toString() === userId.toString();

    // Delete for me — add to deletedFor array (NO Cloudinary deletion)
    if (deleteFor === 'me') {
      if (!message.deletedFor) message.deletedFor = [];
      if (!message.deletedFor.includes(userId)) {
        message.deletedFor.push(userId);
      }
      await message.save();
      return { message, deleteFor: 'me' };
    }

    // Delete for everyone — requires permission check
    if (deleteFor === 'everyone') {
      if (chat.isGroupChat && !isGroupAdmin && !isSender) {
        throw ApiError.forbidden('Only admins can delete others\' messages');
      }
      if (!chat.isGroupChat && !isSender) {
        throw ApiError.forbidden('You can only delete your own messages');
      }

      // Delete attachments from Cloudinary BEFORE clearing DB
      const failedDeletions = [];
      if (message.attachments && message.attachments.length > 0) {
        for (const attachment of message.attachments) {
          if (attachment.public_id) {
            const result = await this._deleteFromCloudinary(
              attachment.public_id,
              attachment.type
            );
            
            if (!result.success) {
              failedDeletions.push({
                public_id: attachment.public_id,
                type: attachment.type,
                error: result.error,
              });
            }
          }
        }
      }

      // Log failed deletions for monitoring/retry
      if (failedDeletions.length > 0) {
        console.error(`⚠️  Failed to delete ${failedDeletions.length} file(s) from Cloudinary:`, 
          failedDeletions.map(f => f.public_id).join(', ')
        );
        // In production, you might want to:
        // - Store these in a "failed_deletions" collection
        // - Set up a retry job
        // - Send alerts to monitoring system
      }

      // Update message in DB (even if some Cloudinary deletions failed)
      message.isDeleted = true;
      message.content = 'This message was deleted';
      message.attachments = []; // Clear attachments from DB
      await message.save();
      
      return { 
        message, 
        deleteFor: 'everyone',
        failedDeletions: failedDeletions.length > 0 ? failedDeletions : undefined,
      };
    }

    throw ApiError.badRequest('Invalid deleteFor value. Must be "me" or "everyone"');
  },

  /**
   * Bulk delete messages.
   * deleteFor: 'me' | 'everyone'
   *
   * Returns:
   * - deletedMessageIds: string[]
   * - byChatId: Record<chatId, string[]>
   */
  async bulkDeleteMessages(userId, { messageIds, deleteFor }) {
    if (!Array.isArray(messageIds) || messageIds.length === 0) {
      throw ApiError.badRequest('messageIds must be a non-empty array');
    }
    if (deleteFor !== 'me' && deleteFor !== 'everyone') {
      throw ApiError.badRequest('Invalid deleteFor value. Must be "me" or "everyone"');
    }

    // Deduplicate while preserving order
    const uniqueIds = [];
    const seen = new Set();
    for (const id of messageIds) {
      if (!id || seen.has(id)) continue;
      seen.add(id);
      uniqueIds.push(id);
    }

    const messages = await Message.find({ _id: { $in: uniqueIds } }).populate('chat');
    if (messages.length === 0) throw ApiError.notFound('Messages not found');

    // Verify access for all selected messages (these come from the UI, but keep it safe)
    for (const msg of messages) {
      const chat = msg.chat;
      const isParticipant = (chat?.participants || []).some(
        (p) => (p?._id || p)?.toString() === userId.toString()
      );
      if (!isParticipant) {
        throw ApiError.notFound('Messages not found');
      }
    }

    const deletedMessageIds = [];
    const byChatId = {};

    if (deleteFor === 'me') {
      // Soft delete for this user (no Cloudinary delete)
      await Message.updateMany(
        { _id: { $in: uniqueIds } },
        { $addToSet: { deletedFor: userId } }
      );

      for (const msg of messages) {
        const chatId = msg.chat?._id?.toString() || msg.chat?.toString();
        deletedMessageIds.push(msg._id.toString());
        byChatId[chatId] = byChatId[chatId] || [];
        byChatId[chatId].push(msg._id.toString());
      }

      return { deletedMessageIds, byChatId, deleteFor };
    }

    // Delete for everyone (permission checked per message)
    for (const id of uniqueIds) {
      const { message, deleteFor: deletedFor } = await this.deleteMessage(id, userId, 'everyone');
      if (deletedFor === 'everyone') {
        const chatId = message.chat?._id?.toString() || message.chat?.toString();
        deletedMessageIds.push(message._id.toString());
        byChatId[chatId] = byChatId[chatId] || [];
        byChatId[chatId].push(message._id.toString());
      }
    }

    return { deletedMessageIds, byChatId, deleteFor };
  },
  async pinMessage(messageId, userId) {
    const message = await Message.findById(messageId);
    if (!message) throw ApiError.notFound('Message not found');
    message.isPinned = !message.isPinned;
    await message.save();
    return message;
  },

  async starMessage(messageId, userId) {
    const message = await Message.findById(messageId);
    if (!message) throw ApiError.notFound('Message not found');
    const uid = userId.toString();
    const starred = message.isStarred.map((s) => s.toString());
    if (starred.includes(uid)) {
      message.isStarred = message.isStarred.filter((s) => s.toString() !== uid);
    } else {
      message.isStarred.push(userId);
    }
    await message.save();
    return message;
  },

  async forwardMessage(messageId, userId, targetChatIds) {
    const original = await Message.findById(messageId)
      .populate('sender', 'name')
      .populate('chat', 'isGroupChat groupName');
    if (!original) throw ApiError.notFound('Message not found');
    const forwarded = [];
    for (const chatId of targetChatIds) {
      const chat = await Chat.findOne({ _id: chatId, participants: userId });
      if (!chat) continue;
      const msg = await Message.create({
        sender: userId,
        chat: chatId,
        content: original.content,
        type: original.type,
        attachments: original.attachments,
        forwardedFrom: original.chat.isGroupChat ? null : original.sender._id, // Only for 1-to-1
        forwardedFromChat: original.chat.isGroupChat ? original.chat._id : null, // Only for groups
      });
      await Chat.findByIdAndUpdate(chatId, { lastMessage: msg._id });
      forwarded.push(msg);
    }
    return forwarded;
  },

  async markAsRead(userId, chatId) {
    await Message.updateMany(
      { chat: chatId, readBy: { $ne: userId } },
      { $addToSet: { readBy: userId } }
    );
  },
  async getMessages(userId, chatId, { page = 1, limit = 50 } = {}) {
    // Verify user is a participant
    const chat = await Chat.findOne({ _id: chatId, participants: userId });
    if (!chat) {
      throw ApiError.notFound("Chat not found or access denied");
    }

    const skip = (page - 1) * limit;

    // Get total count for pagination
    const totalCount = await Message.countDocuments({
      chat: chatId,
      isDeleted: false,
      deletedFor: { $ne: userId },
    });

    // Fetch messages in DESCENDING order (newest first), then reverse
    // This ensures we get the most recent messages when paginating
    const messages = await Message.find({
      chat: chatId,
      isDeleted: false,
      deletedFor: { $ne: userId },
    })
      .populate(SENDER_POPULATE)
      .populate(CHAT_POPULATE)
      .populate(FORWARDED_FROM_POPULATE)
      .populate(FORWARDED_FROM_CHAT_POPULATE)
      .populate(REPLY_TO_POPULATE)
      .sort({ createdAt: -1 }) // Descending - newest first
      .skip(skip)
      .limit(limit);

    // Reverse to show oldest first in the UI
    return messages.reverse();
  },

  /**
   * Clear entire chat history
   * clearFor: 'me' | 'everyone'
   * - 'me': adds userId to deletedFor array for all messages (soft delete for one user)
   * - 'everyone': sets isDeleted = true for all messages (hard delete for all) + deletes files
   * Rules:
   * - Any user can clear for themselves
   * - Group admin/owner: can clear for everyone in groups
   * - 1-to-1: any participant can clear for everyone
   */
  async clearChat(userId, chatId, clearFor) {
    const chat = await Chat.findOne({ _id: chatId, participants: userId });
    if (!chat) {
      throw ApiError.notFound('Chat not found or access denied');
    }

    // Check permissions for "clear for everyone"
    if (clearFor === 'everyone') {
      if (chat.isGroupChat) {
        // Only admin/owner can clear for everyone in groups
        const isOwner = chat.admin?.toString() === userId.toString();
        const isPromotedAdmin = (chat.admins || []).some((a) => a.toString() === userId.toString());
        if (!isOwner && !isPromotedAdmin) {
          throw ApiError.forbidden('Only admins can clear chat for everyone');
        }
      }
      // In 1-to-1 chats, any participant can clear for everyone
    }

    // Get all messages in this chat
    const messages = await Message.find({ chat: chatId });

    if (clearFor === 'me') {
      // Soft delete for this user only
      await Message.updateMany(
        { chat: chatId },
        { $addToSet: { deletedFor: userId } }
      );

      return {
        success: true,
        clearedCount: messages.length,
        clearFor: 'me',
      };
    }

    if (clearFor === 'everyone') {
      // Delete all attachments from Cloudinary
      const failedDeletions = [];
      for (const message of messages) {
        if (message.attachments && message.attachments.length > 0) {
          for (const attachment of message.attachments) {
            if (attachment.public_id) {
              const result = await this._deleteFromCloudinary(
                attachment.public_id,
                attachment.type
              );
              
              if (!result.success && !result.alreadyDeleted) {
                failedDeletions.push({
                  public_id: attachment.public_id,
                  type: attachment.type,
                  error: result.error,
                });
              }
            }
          }
        }
      }

      // Mark all messages as deleted
      await Message.updateMany(
        { chat: chatId },
        {
          isDeleted: true,
          content: 'This message was deleted',
          attachments: [],
        }
      );

      // Clear lastMessage from chat
      await Chat.findByIdAndUpdate(chatId, { lastMessage: null });

      return {
        success: true,
        clearedCount: messages.length,
        clearFor: 'everyone',
        failedDeletions: failedDeletions.length > 0 ? failedDeletions : undefined,
      };
    }

    throw ApiError.badRequest('Invalid clearFor value. Must be "me" or "everyone"');
  },
};

export default messageService;
