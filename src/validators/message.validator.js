import { z } from "zod";

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

export const sendMessageSchema = z.object({
  chatId: z.string().regex(objectIdRegex, "Invalid chat ID"),
  content: z.string().trim().max(5000).optional(),
  type: z.enum(["text", "image", "file"]).default("text"),
  attachments: z
    .array(
      z.object({
        url: z.string().url("Invalid attachment URL"),
        public_id: z.string().optional(), // Optional for backward compatibility
        type: z.enum(["image", "video", "audio", "pdf", "document", "other"]),
        name: z.string().optional(),
        size: z.number().optional(),
      })
    )
    .optional()
    .default([]),
}).refine(
  (data) => data.content || data.attachments.length > 0,
  { message: "Message must have content or at least one attachment" }
);
