import { z } from "zod";

const objectIdRegex = /^[0-9a-fA-F]{24}$/;
const objectId = z.string().regex(objectIdRegex, "Invalid user ID");

export const accessChatSchema = z.object({
  userId: objectId,
});

export const createGroupSchema = z.object({
  groupName: z
    .string({ required_error: "Group name is required" })
    .trim()
    .min(1, "Group name is required")
    .max(100, "Group name must be at most 100 characters"),
  participants: z
    .array(objectId, { required_error: "Participants are required" })
    .min(2, "Group chat requires at least 2 other participants"),
});
