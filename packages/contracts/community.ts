import { z } from "zod";
export const readerPrefs = z.object({
  spoilersHidden: z.boolean().default(false),
  positions: z
    .record(z.string(), z.number().int().min(0).nullable())
    .default({}),
});
export const canvasScope = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("site") }),
  z.object({ kind: z.literal("book"), book: z.string() }),
  z.object({ kind: z.literal("owner"), userId: z.string() }),
  z.object({ kind: z.literal("favorites"), userId: z.string() }),
]);
export const canvasOptions = z.object({
  scope: canvasScope,
  sort: z
    .enum(["recent", "popular", "trending", "random", "favorited"])
    .default("recent"),
  seed: z.string().min(1).max(128).optional(),
  filters: z
    .object({
      book: z.string().optional(),
      style: z.string().optional(),
      mood: z.string().optional(),
      character: z.string().optional(),
      text: z.string().max(300).optional(),
    })
    .default({}),
  cursor: z.string().max(4096).optional(),
  limit: z.number().int().min(1).max(100).default(30),
});
export const searchOptions = z.object({
  query: z.string().max(300),
  kind: z.enum(["book", "character", "artwork", "person"]).optional(),
  book: z.string().optional(),
  style: z.string().optional(),
  mood: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(20),
});
