import Chat from "../models/Chat.model.js";
import Message from "../models/Message.model.js";
import ApiError from "../utils/ApiError.js";

const createSystemMessage = async (chatId, text) => {
  return Message.create({ chat: chatId, content: text, type: "system", sender: null });
};

/**
 * Population options reused across queries.
 */
const PARTICIPANT_POPULATE = {
  path: "participants",
  select: "name email avatar",
};

const LAST_MESSAGE_POPULATE = {
  path: "lastMessage",
  populate: {
    path: "sender",
    select: "name avatar",
  },
};

const chatService = {
  /**
   * Access or create a 1-to-1 chat.
   * If a chat already exists between the two users, return it.
   * Otherwise create a new one.
   */
  async accessOneToOneChat(currentUserId, otherUserId) {
    if (currentUserId.toString() === otherUserId.toString()) {
      throw ApiError.badRequest("Cannot create a chat with yourself");
    }

    // Look for an existing 1-to-1 chat between these two users
    let chat = await Chat.findOne({
      isGroupChat: false,
      participants: {
        $all: [currentUserId, otherUserId],
        $size: 2,
      },
    })
      .populate(PARTICIPANT_POPULATE)
      .populate(LAST_MESSAGE_POPULATE);

    if (chat) {
      return { chat, created: false };
    }

    // Create new 1-to-1 chat
    const newChat = await Chat.create({
      participants: [currentUserId, otherUserId],
      isGroupChat: false,
    });

    chat = await Chat.findById(newChat._id).populate(PARTICIPANT_POPULATE);

    return { chat, created: true };
  },

  /**
   * Create a group chat.
   * The creator is automatically added to participants and set as admin.
   */
  async createGroupChat(currentUserId, { groupName, participants }) {
    // Ensure creator is included in participants (deduplicated)
    const allParticipants = [
      ...new Set([currentUserId.toString(), ...participants]),
    ];

    if (allParticipants.length < 3) {
      throw ApiError.badRequest(
        "Group chat requires at least 3 participants (including you)"
      );
    }

    const newChat = await Chat.create({
      participants: allParticipants,
      isGroupChat: true,
      groupName,
      admin: currentUserId,
    });

    const chat = await Chat.findById(newChat._id)
      .populate(PARTICIPANT_POPULATE)
      .populate("admin", "name email avatar")
      .populate("admins", "name email avatar");

    return chat;
  },

  /**
   * Add members to group (admin only).
   */
  async addMembers(chatId, adminId, userIds) {
    const chat = await Chat.findOne({ _id: chatId, isGroupChat: true })
      .populate("participants", "name")
      .populate("admin", "name");
    if (!chat) throw ApiError.notFound("Group not found");
    if (chat.admin._id.toString() !== adminId.toString())
      throw ApiError.forbidden("Only admin can add members");

    const newIds = userIds.filter(
      (id) => !chat.participants.map((p) => p._id.toString()).includes(id)
    );
    chat.participants.push(...newIds);
    await chat.save();

    // System message for each added user
    const { default: User } = await import("../models/User.model.js");
    const addedUsers = await User.find({ _id: { $in: newIds } }).select("name");
    for (const u of addedUsers) {
      await createSystemMessage(chatId, `${chat.admin.name} added ${u.name}`);
    }

    return Chat.findById(chatId)
      .populate(PARTICIPANT_POPULATE)
      .populate("admin", "name email avatar")
      .populate("admins", "name email avatar");
  },

  /**
   * Remove a member from group (admin only).
   */
  async removeMember(chatId, adminId, userId) {
    const chat = await Chat.findOne({ _id: chatId, isGroupChat: true })
      .populate("admin", "name")
      .populate("participants", "name");
    if (!chat) throw ApiError.notFound("Group not found");

    const isOwner = chat.admin._id.toString() === adminId.toString();
    const isPromotedAdmin = chat.admins.map((a) => a.toString()).includes(adminId.toString());
    if (!isOwner && !isPromotedAdmin)
      throw ApiError.forbidden("Only admins can remove members");

    // Only owner can remove other admins
    const targetIsAdmin = chat.admins.map((a) => a.toString()).includes(userId.toString());
    if (targetIsAdmin && !isOwner)
      throw ApiError.forbidden("Only the group owner can remove admins");

    if (chat.admin._id.toString() === userId.toString())
      throw ApiError.badRequest("Cannot remove the group owner");

    const removed = chat.participants.find((p) => p._id.toString() === userId)
    chat.participants = chat.participants.filter((p) => p._id.toString() !== userId);
    // Also remove from admins if promoted
    chat.admins = chat.admins.filter((a) => a.toString() !== userId);
    await chat.save();

    if (removed) {
      await createSystemMessage(chatId, `${chat.admin.name} removed ${removed.name}`);
    }

    return Chat.findById(chatId)
      .populate(PARTICIPANT_POPULATE)
      .populate("admin", "name email avatar")
      .populate("admins", "name email avatar");
  },

  /**
   * Leave a group chat.
   */
  async leaveGroup(chatId, userId) {
    const chat = await Chat.findOne({ _id: chatId, isGroupChat: true })
      .populate("participants", "name")
      .populate("admin", "name");
    if (!chat) throw ApiError.notFound("Group not found");

    const leavingUser = chat.participants.find((p) => p._id.toString() === userId.toString());
    if (!leavingUser) throw ApiError.badRequest("You are not a member of this group");

    // If admin leaves, transfer to next participant
    if (chat.admin._id.toString() === userId.toString()) {
      const next = chat.participants.find((p) => p._id.toString() !== userId.toString());
      if (!next) {
        await Chat.findByIdAndDelete(chatId);
        return null;
      }
      chat.admin = next._id;
      await createSystemMessage(chatId, `${leavingUser.name} left. ${next.name} is now admin`);
    } else {
      await createSystemMessage(chatId, `${leavingUser.name} left the group`);
    }

    chat.participants = chat.participants.filter((p) => p._id.toString() !== userId.toString());
    await chat.save();
    return chat;
  },

  /**
   * Update group name (admin only).
   */
  async updateGroup(chatId, adminId, { groupName }) {
    const chat = await Chat.findOne({ _id: chatId, isGroupChat: true })
      .populate("admin", "name");
    if (!chat) throw ApiError.notFound("Group not found");
    if (chat.admin._id.toString() !== adminId.toString())
      throw ApiError.forbidden("Only admin can update group info");

    const oldName = chat.groupName;
    if (groupName) chat.groupName = groupName;
    await chat.save();

    if (groupName && groupName !== oldName) {
      await createSystemMessage(chatId, `${chat.admin.name} changed the group name to "${groupName}"`);
    }

    return Chat.findById(chatId)
      .populate(PARTICIPANT_POPULATE)
      .populate("admin", "name email avatar");
  },

  /**
   * Transfer admin role (admin only).
   */
  async transferAdmin(chatId, adminId, newAdminId) {
    const chat = await Chat.findOne({ _id: chatId, isGroupChat: true })
      .populate("participants", "name")
      .populate("admin", "name");
    if (!chat) throw ApiError.notFound("Group not found");
    if (chat.admin._id.toString() !== adminId.toString())
      throw ApiError.forbidden("Only owner can promote/demote admins");
    if (!chat.participants.map((p) => p._id.toString()).includes(newAdminId))
      throw ApiError.badRequest("User must be a group member");

    const newAdmin = chat.participants.find((p) => p._id.toString() === newAdminId);
    const admins = chat.admins.map((a) => a.toString());

    if (admins.includes(newAdminId)) {
      // Demote — remove from admins array
      chat.admins = chat.admins.filter((a) => a.toString() !== newAdminId);
      await chat.save();
      if (newAdmin) {
        await createSystemMessage(chatId, `${chat.admin.name} removed ${newAdmin.name} as admin`);
      }
    } else {
      // Promote — add to admins array
      chat.admins.push(newAdminId);
      await chat.save();
      if (newAdmin) {
        await createSystemMessage(chatId, `${chat.admin.name} made ${newAdmin.name} an admin`);
      }
    }

    return Chat.findById(chatId)
      .populate(PARTICIPANT_POPULATE)
      .populate("admin", "name email avatar")
      .populate("admins", "name email avatar");
  },
  async getUserChats(currentUserId) {
    const chats = await Chat.find({
      participants: currentUserId,
    })
      .populate(PARTICIPANT_POPULATE)
      .populate(LAST_MESSAGE_POPULATE)
      .populate("admin", "name email avatar")
      .populate("admins", "name email avatar")
      .sort({ updatedAt: -1 });

    return chats;
  },

  /**
   * Pin/Unpin a chat for a user
   */
  async togglePinChat(chatId, userId) {
    const chat = await Chat.findOne({ _id: chatId, participants: userId });
    if (!chat) throw ApiError.notFound("Chat not found or access denied");

    const isPinned = chat.pinnedBy.some((id) => id.toString() === userId.toString());
    
    if (isPinned) {
      // Unpin
      chat.pinnedBy = chat.pinnedBy.filter((id) => id.toString() !== userId.toString());
    } else {
      // Pin
      chat.pinnedBy.push(userId);
    }
    
    await chat.save();
    
    return Chat.findById(chatId)
      .populate(PARTICIPANT_POPULATE)
      .populate(LAST_MESSAGE_POPULATE)
      .populate("admin", "name email avatar")
      .populate("admins", "name email avatar");
  },
};

export default chatService;
