import { z } from "zod";
const text = z.string().min(1);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const coverEntry = z.discriminatedUnion("status", [
  z
    .object({ bookId: text, title: text, status: z.literal("missing") })
    .passthrough(),
  z
    .object({
      bookId: text,
      title: text,
      status: z.literal("found"),
      source: z.enum([
        "openlibrary-isbn",
        "openlibrary-work",
        "googlebooks",
        "publisher",
      ]),
      imageUrl: z.url(),
      pageUrl: z.url(),
      isbnUsed: text.nullable(),
      openLibraryWorkKey: text.nullable(),
      file: text,
      mime: z.enum(["image/jpeg", "image/png", "image/webp"]),
      bytes: z
        .number()
        .int()
        .positive()
        .max(12 * 1024 * 1024),
      width: z.number().int().min(280),
      height: z.number().int().positive(),
      sha256: hash,
      match: text,
      accessed: text,
      notes: z.string().nullable(),
    })
    .passthrough(),
]);
export const coverManifest = z
  .object({ schemaVersion: z.literal(1), covers: z.array(coverEntry) })
  .superRefine((x, c) => {
    if (new Set(x.covers.map((e) => e.bookId)).size !== x.covers.length)
      c.addIssue({ code: "custom", message: "Duplicate cover book" });
  });
// The catalog is fiction only. Genres come from this one controlled, Title Case vocabulary.
export const fictionGenres = [
  "Literary Fiction",
  "Contemporary Fiction",
  "Historical Fiction",
  "Romance",
  "Romantasy",
  "Fantasy",
  "Science Fiction",
  "Dystopian",
  "Mystery",
  "Thriller",
  "Psychological Thriller",
  "Horror",
  "Young Adult",
  "Middle Grade",
  "Short Stories",
] as const;
export const fictionGenre = z.enum(fictionGenres, {
  error: (i) => `Unknown genre ${JSON.stringify(i.input)}`,
});
export const catalogGenres = z
  .array(fictionGenre)
  .min(1)
  .max(4)
  .refine((g) => new Set(g).size === g.length, "Duplicate genre");
export const catalogListSlugs = ["decade", "popular-2026"] as const;
const name = z.string().trim().min(1).max(180);
const isbn13 = z
  .string()
  .refine(
    (x) =>
      /^97[89][0-9]{10}$/.test(x) &&
      Array.from(x).reduce((sum, d, i) => sum + +d * (i % 2 ? 3 : 1), 0) %
        10 ===
        0,
    { error: (i) => `Invalid ISBN-13 ${JSON.stringify(i.input)}` },
  );
const rank = z.number().int().positive();
const catalogList = z
  .object({ title: text, windowStart: text, windowEnd: text, method: text })
  .strict();
const catalogBook = z
  .object({
    key: z
      .string()
      .max(128)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Book key must be kebab-case"),
    title: name,
    authors: z.array(name).min(1).max(12),
    firstPublicationYear: z.number().int().min(1).max(2100).nullable(),
    series: z
      .object({ name, number: z.number().min(0).max(9999).nullable() })
      .strict()
      .nullable(),
    originalLanguage: z
      .string()
      .regex(/^[a-z]{2}$/, "Original language must be an ISO 639-1 code")
      .nullable(),
    classification: z.literal("fiction", {
      error: "Fiction only: nonfiction books are not imported",
    }),
    genres: catalogGenres,
    isbn13: isbn13.nullable(),
    premise: z
      .string()
      .min(1)
      .max(400)
      .regex(/^[^\p{Cc}<>]+$/u, "Premise must be plain text")
      .nullable(),
    ranks: z
      .object({ decade: rank.optional(), "popular-2026": rank.optional() })
      .strict()
      .refine(
        (r) => Object.keys(r).length > 0,
        "A book needs a rank in at least one list",
      ),
    source: z.record(z.string(), z.unknown()),
  })
  .strict();
// The one reviewed catalog file: every book carries its rank in each list it belongs to.
export const catalogData = z
  .object({
    schemaVersion: z.literal(2),
    lists: z
      .object({ decade: catalogList, "popular-2026": catalogList })
      .strict(),
    books: z.array(catalogBook),
  })
  .strict()
  .superRefine((x, c) => {
    const duplicate = (values: string[]) =>
      values.find((v, i) => values.indexOf(v) !== i);
    const key = duplicate(x.books.map((b) => b.key));
    if (key)
      c.addIssue({ code: "custom", message: `Duplicate book key ${key}` });
    const isbn = duplicate(x.books.flatMap((b) => b.isbn13 ?? []));
    if (isbn) c.addIssue({ code: "custom", message: `Duplicate ISBN ${isbn}` });
    for (const slug of catalogListSlugs) {
      const ranks = x.books
        .flatMap((b) => b.ranks[slug] ?? [])
        .sort((a, b) => a - b);
      const gap = ranks.findIndex((r, i) => r !== i + 1);
      if (gap >= 0)
        c.addIssue({
          code: "custom",
          message: `Ranks in ${slug} must be unique and contiguous from 1 (rank ${gap + 1})`,
        });
    }
  });
export type CatalogData = z.infer<typeof catalogData>;
export const catalogRemoval = z
  .object({
    schemaVersion: z.literal(1),
    reason: text,
    books: z.array(z.object({ bookId: text, title: text }).strict()).min(1),
  })
  .strict()
  .refine(
    (x) => new Set(x.books.map((b) => b.bookId)).size === x.books.length,
    "Duplicate removal book",
  );
export type CoverEntry = z.infer<typeof coverEntry>;
