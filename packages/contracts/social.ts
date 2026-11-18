import { z } from "zod";
export const avatarSlots = [
  "background",
  "body",
  "palette",
  "headwear",
  "eyewear",
  "outfit",
  "heldItem",
  "frame",
] as const;
export const avatarSchema = z.partialRecord(
  z.enum(avatarSlots),
  z.string().regex(/^[a-z0-9_-]{1,64}$/),
);
export const handleSchema = z.string().regex(/^[a-z0-9_-]{3,24}$/);
export const profileSchema = z.object({
  handle: handleSchema,
  shown: z.enum(["pseudonym", "real"]),
  realName: z.string().trim().max(60),
  private: z.boolean(),
});
export const requestKeySchema = z.string().min(1).max(128);
export const commentSchema = z
  .string()
  .min(1)
  .max(1000)
  .refine((value) => value.trim().length > 0, "Comment must contain text");
export const shelfStateSchema = z.enum(["want", "reading", "read"]);
export type Avatar = z.infer<typeof avatarSchema>;
