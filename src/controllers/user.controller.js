import User from "../models/User.model.js";
import asyncHandler from "../utils/asyncHandler.js";
import cloudinary from "../config/cloudinary.js";
import ApiError from "../utils/ApiError.js";
import { getIo } from "../socket/socket.handler.js";

const userController = {
  /**
   * GET /api/user
   * Returns all users except the logged-in user.
   * Supports optional ?search= query.
   */
  getUsers: asyncHandler(async (req, res) => {
    const search = req.query.search
      ? {
          $or: [
            { name: { $regex: req.query.search, $options: "i" } },
            { email: { $regex: req.query.search, $options: "i" } },
          ],
        }
      : {}

    const users = await User.find({
      ...search,
      _id: { $ne: req.user._id },
    }).select("name email avatar")

    res.status(200).json({ success: true, data: users })
  }),

  /**
   * PUT /api/user/profile-picture
   * Update user's profile picture
   */
  updateProfilePicture: asyncHandler(async (req, res) => {
    console.log('updateProfilePicture called');
    console.log('req.file:', req.file);
    console.log('req.user:', req.user);

    if (!req.file) {
      throw ApiError.badRequest("No image file provided");
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      throw ApiError.notFound("User not found");
    }

    // Delete old avatar from Cloudinary if exists
    if (user.avatar) {
      try {
        // Extract public_id from avatar URL
        const urlParts = user.avatar.split('/');
        const filename = urlParts[urlParts.length - 1];
        const publicId = `chat-app/${filename.split('.')[0]}`;
        console.log('Deleting old avatar:', publicId);
        await cloudinary.uploader.destroy(publicId, { resource_type: "image" });
      } catch (error) {
        console.error("Failed to delete old avatar:", error);
        // Continue even if deletion fails
      }
    }

    // Update user avatar
    user.avatar = req.file.path;
    await user.save();

    console.log('Avatar updated successfully:', user.avatar);

    // Emit socket event to notify all connected clients
    const io = getIo();
    if (io) {
      io.emit('user_avatar_updated', {
        userId: user._id.toString(),
        avatar: user.avatar,
      });
    }

    res.status(200).json({
      success: true,
      message: "Profile picture updated successfully",
      data: { avatar: user.avatar },
    });
  }),
  /**
   * DELETE /api/user/account
   * Delete user account permanently
   */
  deleteAccount: asyncHandler(async (req, res) => {
    const { password } = req.body;

    if (!password) {
      throw ApiError.badRequest("Password is required");
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      throw ApiError.notFound("User not found");
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      throw ApiError.unauthorized("Invalid password");
    }

    // Delete user's avatar from Cloudinary if exists
    if (user.avatar) {
      try {
        const urlParts = user.avatar.split('/');
        const filename = urlParts[urlParts.length - 1];
        const publicId = `chat-app/${filename.split('.')[0]}`;
        await cloudinary.uploader.destroy(publicId, { resource_type: "image" });
      } catch (error) {
        console.error("Failed to delete avatar:", error);
      }
    }

    // Import models here to avoid circular dependency
    const Chat = (await import("../models/Chat.model.js")).default;
    const Message = (await import("../models/Message.model.js")).default;

    // Delete all messages sent by this user
    await Message.deleteMany({ sender: user._id });

    // Remove user from all chats and delete 1-on-1 chats
    const userChats = await Chat.find({ participants: user._id });
    
    for (const chat of userChats) {
      if (chat.isGroupChat) {
        // Remove user from group
        chat.participants = chat.participants.filter(
          (p) => p.toString() !== user._id.toString()
        );
        
        // Remove from admins if present
        if (chat.admins) {
          chat.admins = chat.admins.filter(
            (a) => a.toString() !== user._id.toString()
          );
        }

        // If user was the owner, transfer ownership to first admin or first participant
        if (chat.admin && chat.admin.toString() === user._id.toString()) {
          if (chat.admins && chat.admins.length > 0) {
            chat.admin = chat.admins[0];
          } else if (chat.participants.length > 0) {
            chat.admin = chat.participants[0];
          } else {
            // No participants left, delete the chat
            await Chat.findByIdAndDelete(chat._id);
            continue;
          }
        }

        // If no participants left, delete the chat
        if (chat.participants.length === 0) {
          await Chat.findByIdAndDelete(chat._id);
        } else {
          await chat.save();
        }
      } else {
        // Delete 1-on-1 chats
        await Chat.findByIdAndDelete(chat._id);
      }
    }

    // Delete the user
    await User.findByIdAndDelete(user._id);

    // Emit socket event to notify all connected clients
    const io = getIo();
    if (io) {
      io.emit('user_deleted', { userId: user._id.toString() });
    }

    // Clear cookie
    res.clearCookie('accessToken');

    res.status(200).json({
      success: true,
      message: "Account deleted successfully",
    });
  }),
}

export default userController
