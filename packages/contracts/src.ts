import { z } from "zod";
export const short = z.string().trim().min(1).max(180);
export const key = z.string().min(1).max(128);
export const book = z.string().min(1).max(100);
export const chapter = z.number().int().min(1).max(9999);
export const position = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("reading"), chapter }),
  z.object({ kind: z.literal("finished"), chapter }),
  z.object({ kind: z.literal("anchor"), chapter, anchor: short }),
  z.object({
    kind: z.literal("page"),
    edition_id: book.optional(),
    page: z.number().int().positive(),
  }),
  z.object({ kind: z.literal("unknown") }),
]);
export const isbn = z
  .string()
  .transform((x) => x.replace(/[- ]/g, "").toUpperCase())
  .refine(
    (x) => /^(?:[0-9]{13}|[0-9]{9}[0-9X])$/.test(x),
    "Enter an ISBN-10 or ISBN-13",
  );
export const query = z.object({
  query: z.string().max(180).default(""),
  page: z.number().int().min(1).max(10000).default(1),
  author: short.optional(),
  isbn: isbn.optional(),
});
export const scene = z.object({
  book_id: book,
  position,
  visible_names: z.array(short).max(24).default([]),
  scene_cues: z.string().max(400).optional(),
  interpretations: z.boolean().default(false),
});
export const reportFact = z.object({
  book_id: book,
  fact_id: key,
  position,
  reason: z.enum([
    "appearance",
    "scene_place",
    "contradiction",
    "spoiler",
    "unsupported",
  ]),
  explanation: z.string().trim().min(1).max(1200),
  correction: z.string().trim().max(600).optional(),
  source: z.string().trim().max(300).optional(),
  request_key: key,
});
function verifiedWorkKey() {
  return z.string().regex(/^\/works\/OL[0-9]+W$/);
}
export const request = z
  .object({
    book_id: book.optional(),
    work_key: verifiedWorkKey().optional(),
    title: short.optional(),
    authors: z.array(short).min(1).max(12).optional(),
    disambiguator: short.optional(),
    isbn: isbn.optional(),
    missing_coverage: short.optional(),
    request_key: key,
  })
  .refine(
    (x) => x.book_id || x.work_key || (x.title && x.authors),
    "Supply a book ID or title and authors",
  );
export const MAX_BYTES = 12 * 1024 * 1024;
export const stage = z
  .object({
    book_id: book,
    purpose: z.enum(["artwork", "evidence"]),
    mime: z.enum([
      "image/png",
      "image/jpeg",
      "image/webp",
      "image/heic",
      "image/heif",
    ]),
    size: z.number().int().positive().max(MAX_BYTES).optional(),
    request_key: key,
    file: z
      .object({
        download_url: z.url(),
        file_id: short,
        mime_type: short.optional(),
        file_name: short.optional(),
      })
      .optional(),
  })
  .refine(
    (x) => x.file || x.size,
    "Supply file metadata with byte size for a local upload",
  );
export const metadata = z.object({
  position,
  credit: short,
  alt: z.string().trim().min(1).max(1200),
  character_ids: z.array(book).max(32).default([]),
  mood: short.optional(),
  style: short.optional(),
});
export const publish = metadata.extend({
  book_id: book,
  asset_id: book,
  request_key: key,
});
export const contribute = z
  .object({
    book_id: book,
    character: short,
    // Omitted by existing character-only clients; places must be explicit.
    subject_kind: z.enum(["character", "place"]).optional(),
    description: z.string().trim().min(1).max(1800).optional(),
    asset_id: book.optional(),
    position: position.default({ kind: "unknown" }),
    kind: z.enum(["fact", "interpretation"]),
    source: short.optional(),
    credit: short,
    original_sketch: z.boolean().default(false),
    allow_display: z.boolean(),
    allow_reference: z.boolean(),
    allow_external_model: z.boolean(),
    request_key: key,
  })
  .refine((x) => x.description || x.asset_id, "Add text or a staged image")
  .refine(
    (x) => x.kind === "interpretation" || x.source,
    "A factual correction requires a source",
  );
export const contextContribution = z
  .object({
    ...contribute.shape,
    character: short.optional(),
    subject: short,
    subject_kind: z.enum(["character", "place"]),
  })
  .refine((x) => x.description || x.asset_id, "Add text or a staged image")
  .refine(
    (x) => x.kind === "interpretation" || x.source,
    "A factual correction requires a source",
  )
  .refine(
    (x) => !x.character || x.character === x.subject,
    "Conflicting subjects",
  );
export const finding = z.object({
  subject: short,
  detail: z.string().trim().min(1).max(450),
  source_url: z.url().startsWith("https://").max(1500),
  locator: short,
  quote: z.string().max(600),
  chapter: chapter.nullable(),
  anchor: short.optional(),
  end_chapter: chapter.optional(),
  disputed: z.boolean().default(false),
});
export const verifiedWork = z.object({
  key: z.string().regex(/^\/works\/OL[0-9]+W$/),
  title: short,
  authors: z.array(short).min(1).max(30),
});
export const findings = z.object({
  work: verifiedWork.optional(),
  findings: z.array(finding).max(60),
  gaps: z.array(short).max(24),
});
export const scopes = [
  "books:request",
  "artwork:write",
  "characters:contribute",
] as const;

// Only categorical operator messages cross the runner trust boundary; no prompts or provider errors.
export const providerFailure = z.enum([
  "configuration",
  "authentication",
  "account_limit",
  "model_rate_limit",
  "model_unavailable",
  "pricing",
  "capability",
  "deadline",
  "aborted",
  "budget",
  "invalid_response",
  "transport",
  "cooldown",
]);
export const providerRouting = z.object({
  updatedAt: z.number().int().positive(),
  selectedModel: z
    .string()
    .regex(/^[a-z0-9.-]+\/[a-z0-9.-]+:free$/)
    .max(150)
    .optional(),
  attempts: z.number().int().min(0).max(8),
  fallback: z.boolean(),
  category: providerFailure.optional(),
  retryAfterMs: z.number().nonnegative().max(86400000).optional(),
});
export const runnerHeartbeat = z.object({
  state: z.enum(["starting", "idle", "researching", "blocked", "error"]),
  job: key.nullable(),
  session: key.nullable(),
  model: z
    .string()
    .regex(/^openrouter\/[a-z0-9.-]+\/[a-z0-9.-]+:free$/)
    .max(170),
  routing: providerRouting.nullable(),
  last_error: z
    .enum([
      "model_unavailable",
      "search_unavailable",
      "research_failed",
      "runner_unavailable",
    ])
    .nullable(),
  started: z.number().int().positive(),
});
export const runnerEvent = z.object({
  id: z.string().uuid(),
  kind: z.enum([
    "started",
    "claimed",
    "completed",
    "failed",
    "blocked",
    "recovered",
  ]),
  job: key.nullable(),
});
