import mongoose from "mongoose";

const attachmentSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      required: [true, "Attachment URL is required"],
    },
    public_id: {
      type: String,
      required: false, // Optional for backward compatibility with old messages
    },
    type: {
      type: String,
      enum: {
        values: ["image", "video", "audio", "pdf", "document", "other"],
        message: "Attachment type '{VALUE}' is not supported",
      },
      required: [true, "Attachment type is required"],
    },
    name: {
      type: String,
      default: "",
    },
    size: {
      type: Number, // bytes
    },
  },
  { _id: false }
);

const messageSchema = new mongoose.Schema(
  {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: function() { return this.type !== "system"; },
      index: true,
    },
    chat: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Chat",
      required: [true, "Chat reference is required"],
      index: true,
    },
    content: {
      type: String,
      trim: true,
      maxlength: [5000, "Message content must be at most 5000 characters"],
    },
    attachments: {
      type: [attachmentSchema],
      default: [],
    },
    readBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    deletedFor: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    type: {
      type: String,
      enum: {
        values: ["text", "image", "file", "system"],
        message: "Message type '{VALUE}' is not supported",
      },
      default: "text",
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    editedAt: {
      type: Date,
      default: null,
    },
    isPinned: {
      type: Boolean,
      default: false,
    },
    isStarred: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
      default: null,
    },
    forwardedFrom: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      // Original sender when message is forwarded from 1-to-1 chat
    },
    forwardedFromChat: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Chat",
      default: null,
      // Original chat when message is forwarded (for group name)
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// ── Validation: message must have content OR attachments ──
messageSchema.pre("validate", function () {
  if (this.type === "system") return; // system messages only need content
  if (!this.content && (!this.attachments || this.attachments.length === 0)) {
    this.invalidate("content", "Message must have content or at least one attachment");
  }
});

// ── Indexes ───────────────────────────────────────────────
// Fast retrieval: "get messages for a chat, sorted by time"
messageSchema.index({ chat: 1, createdAt: -1 });

const Message = mongoose.model("Message", messageSchema);

export default Message;
