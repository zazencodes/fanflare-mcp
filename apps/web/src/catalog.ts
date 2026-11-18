import {
  coverEntry,
  catalogData,
  catalogListSlugs,
  catalogRemoval,
  type CoverEntry,
} from "../../../packages/contracts/catalog.ts";
import {
  type Env,
  required,
  first,
  rows,
  statement,
  digest,
  fail,
  id,
  now,
  type Row,
} from "./common.ts";
import { catalogBookIdentity } from "./books.ts";
import {
  type PublicImage,
  artTag,
  contentVersion,
  coverPath,
  coverTag,
  placeholderPath,
  purgeImages,
  storedWebp,
} from "./images.ts";

// Infrastructure-credentialed operator scripts are the sole callers of imports.
export async function importCover(
  env: Env,
  input: CoverEntry,
  bytes?: Uint8Array,
) {
  const entry = coverEntry.parse(input);
  const book = await first(
    env,
    "SELECT title FROM books WHERE id=?",
    entry.bookId,
  );
  if (!book) return { bookId: entry.bookId, status: "pending" };
  if (book.title !== entry.title) fail("Cover title differs from D1", 409);
  if (entry.status === "found") {
    if (
      !bytes ||
      bytes.length !== entry.bytes ||
      (await digest(bytes.slice().buffer)) !== entry.sha256
    )
      fail("Cover bytes, size or sha256 mismatch", 409);
    const info = await env.IMAGES.info(
      new Blob([bytes.slice().buffer]).stream(),
    );
    if (
      info.format !== entry.mime ||
      !("width" in info) ||
      info.width !== entry.width ||
      info.height !== entry.height ||
      info.width * info.height > 24000000
    )
      fail("Cover mime or dimensions mismatch", 415);
  }
  const fingerprint =
    entry.status === "found"
      ? entry.sha256
      : await digest(JSON.stringify(entry));
  const latest = await current(env, entry.bookId);
  const previous =
    latest?.fingerprint === fingerprint
      ? latest
      : await first(
          env,
          "SELECT version,removed FROM book_covers WHERE book=? AND fingerprint=? AND removed IS NOT NULL ORDER BY version DESC LIMIT 1",
          entry.bookId,
          fingerprint,
        );
  if (previous)
    return {
      bookId: entry.bookId,
      status: previous.removed ? "removed" : "unchanged",
      version: previous.version,
    };
  const prefix = `covers/${encodeURIComponent(entry.bookId)}/${fingerprint}/${crypto.randomUUID()}`;
  const keys: string[] = [];
  let version: number;
  try {
    if (entry.status === "found")
      for (const width of [320, 640]) {
        const output = await env.IMAGES.input(
          new Blob([bytes!.slice().buffer]).stream(),
        )
          .transform({ width: Math.min(width, entry.width), fit: "scale-down" })
          .output({ format: "image/webp", quality: 85, anim: false });
        const key = `${prefix}/${width}.webp`;
        await env.MEDIA.put(key, await output.response().arrayBuffer(), {
          httpMetadata: { contentType: "image/webp" },
        });
        keys.push(key);
      }
    const result = await statement(
      env,
      `INSERT INTO book_covers(book,status,fingerprint,provenance,original_sha256,width,height,key_320,key_640,imported) VALUES(?,?,?,?,?,?,?,?,?,?) RETURNING version`,
      entry.bookId,
      entry.status,
      fingerprint,
      JSON.stringify(entry),
      entry.status === "found" ? entry.sha256 : null,
      entry.status === "found" ? entry.width : null,
      entry.status === "found" ? entry.height : null,
      keys[0] ?? null,
      keys[1] ?? null,
      now(),
    ).first<{ version: number }>();
    version = result!.version;
  } catch (e) {
    if (keys.length) await env.MEDIA.delete(keys);
    throw e;
  }
  // The new version replaces the book's previous cover or placeholder URL.
  await purgeImages(env, [coverTag(entry.bookId)]);
  return { bookId: entry.bookId, status: entry.status, version };
}
const current = (env: Env, book: string) =>
  first(
    env,
    "SELECT * FROM book_covers WHERE book=? ORDER BY version DESC LIMIT 1",
    book,
  );
/** Resolve a page's cover URLs in one authoritative D1 read. */
export async function coverUrls(
  env: Env,
  books: string[],
  width: 320 | 640 = 320,
): Promise<Map<string, string>> {
  if (!books.length) return new Map();
  const data = await rows(
    env,
    `SELECT b.id,b.title,b.authors,c.status,c.removed,c.version FROM books b LEFT JOIN book_covers c ON c.book=b.id AND c.version=(SELECT max(version) FROM book_covers WHERE book=b.id) WHERE b.id IN (SELECT value FROM json_each(?))`,
    JSON.stringify(books),
  );
  if (data.length !== new Set(books).size) fail("Book unavailable", 404);
  return new Map(
    data.map((b) => [
      b.id,
      b.status === "found" && !b.removed
        ? coverPath(b.id, b.version, width)
        : placeholderPath(b.id, placeholderFor(b)),
    ]),
  );
}
export async function coverUrl(
  env: Env,
  book: string,
  width: 320 | 640 = 320,
): Promise<string> {
  return (await coverUrls(env, [book], width)).get(book)!;
}
const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
function wrap(text: string, limit: number) {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).flatMap((w) =>
    Array.from(w).reduce<string[]>((a, c, i) => {
      if (i % limit === 0) a.push("");
      a[a.length - 1] += c;
      return a;
    }, []),
  )) {
    if (line && Array.from(line + " " + word).length > limit) {
      lines.push(line);
      line = "";
    }
    line += (line ? " " : "") + word;
  }
  if (line) lines.push(line);
  return lines;
}
export function placeholderCover(
  title: string,
  author: string,
  book: string,
): string {
  let seed = 0;
  for (const c of book) seed = (seed * 31 + c.charCodeAt(0)) >>> 0;
  const palettes = [
    ["#e0e7ff", "#fce7f3", "#3730a3"],
    ["#ede9fe", "#ffedd5", "#5b21b6"],
    ["#dbeafe", "#fce7f3", "#4338ca"],
  ];
  const [a, b, ink] = palettes[seed % palettes.length];
  const titleLines = wrap(title, 21);
  const size = Math.min(39, 300 / titleLines.length);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="960" viewBox="0 0 640 960"><defs><linearGradient id="paper" x2="1" y2="1"><stop stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="640" height="960" fill="url(#paper)"/><rect x="30" y="30" width="580" height="900" rx="3" fill="none" stroke="${ink}" opacity=".25"/><path d="M72 160h84M72 780h84" stroke="${ink}" stroke-width="3"/><g fill="${ink}" font-family="Georgia, 'Times New Roman', serif" font-size="${size}">${titleLines.map((l, i) => `<text x="72" y="${260 + i * size * 1.25}">${escape(l)}</text>`).join("")}</g><g fill="${ink}" font-family="system-ui, sans-serif" font-size="22">${wrap(
    author,
    35,
  )
    .slice(0, 4)
    .map((l, i) => `<text x="72" y="${830 + i * 26}">${escape(l)}</text>`)
    .join("")}</g></svg>`;
}
const placeholderFor = (b: Row) =>
  placeholderCover(b.title, JSON.parse(b.authors)[0] ?? "", b.id);
/**
 * A cover rendition, or the generated placeholder, at its public URL. Only the
 * book's current, unremoved cover version is served; a book with such a cover
 * serves no placeholder.
 */
export async function publicCover(
  env: Env,
  book: string,
  version: string,
  file: string,
): Promise<PublicImage | null> {
  const b = await first(
    env,
    `SELECT b.id,b.title,b.authors,c.status,c.removed,c.version,c.key_320,c.key_640 FROM books b LEFT JOIN book_covers c ON c.book=b.id AND c.version=(SELECT max(version) FROM book_covers WHERE book=b.id) WHERE b.id=?`,
    book,
  );
  if (!b) return null;
  if (b.status === "found" && !b.removed) {
    const width = ({ "320.webp": 320, "640.webp": 640 } as const)[file];
    if (!width || version !== String(b.version)) return null;
    return {
      tag: coverTag(book),
      etag: `"cover-${b.version}-${width}"`,
      body: () => storedWebp(env, b[`key_${width}`]),
    };
  }
  const svg = placeholderFor(b);
  if (file !== "placeholder.svg" || version !== contentVersion(svg))
    return null;
  return {
    tag: coverTag(book),
    etag: `"${version}"`,
    body: async () => ({ body: svg, type: "image/svg+xml; charset=utf-8" }),
  };
}
export async function removeCover(env: Env, moderator: string, book: string) {
  await required(
    env,
    "SELECT user_id FROM moderators WHERE user_id=?",
    moderator,
  );
  await required(env, "SELECT id FROM books WHERE id=?", book);
  await statement(
    env,
    "UPDATE book_covers SET removed=?,removed_by=? WHERE book=? AND removed IS NULL",
    now(),
    moderator,
    book,
  ).run();
  await purgeImages(env, [coverTag(book)]);
}
// Books per D1 round trip. Each chunk is one transaction and converges on rerun.
const IMPORT_CHUNK = 200;
const chunked = <T>(items: T[]) =>
  Array.from({ length: Math.ceil(items.length / IMPORT_CHUNK) }, (_, i) =>
    items.slice(i * IMPORT_CHUNK, (i + 1) * IMPORT_CHUNK),
  );
const field = (name: string) => `json_extract(j.value,'$.${name}')`;
const IMPORT_BOOKS = [
  `INSERT INTO books(id,identity,title,authors,disambiguator,created)
 SELECT ${field("id")},${field("identity")},${field("title")},${field("authors")},NULL,?2 FROM json_each(?1) j WHERE true
 ON CONFLICT(identity) DO UPDATE SET title=excluded.title,authors=excluded.authors
 WHERE title IS NOT excluded.title OR authors IS NOT excluded.authors`,
  // A key bound to another book violates the primary key and aborts the chunk.
  `INSERT INTO seed_catalog(seed_id,book_id)
 SELECT ${field("key")},${field("id")} FROM json_each(?1) j
 WHERE NOT EXISTS(SELECT 1 FROM seed_catalog s WHERE s.seed_id=${field("key")} AND s.book_id=${field("id")})`,
  `INSERT INTO book_details(book,genres,classification,first_publication_year,provenance,series,series_number,original_language,premise)
 SELECT ${field("id")},${field("genres")},${field("classification")},${field("year")},${field("provenance")},${field("series")},${field("seriesNumber")},${field("language")},${field("premise")} FROM json_each(?1) j WHERE true
 ON CONFLICT(book) DO UPDATE SET genres=excluded.genres,classification=excluded.classification,first_publication_year=excluded.first_publication_year,provenance=excluded.provenance,series=excluded.series,series_number=excluded.series_number,original_language=excluded.original_language,premise=excluded.premise
 WHERE genres IS NOT excluded.genres OR classification IS NOT excluded.classification OR first_publication_year IS NOT excluded.first_publication_year OR provenance IS NOT excluded.provenance OR series IS NOT excluded.series OR series_number IS NOT excluded.series_number OR original_language IS NOT excluded.original_language OR premise IS NOT excluded.premise`,
  // An ISBN on another book violates the unique index and aborts the chunk.
  `INSERT INTO editions(id,book,id_label,isbn)
 SELECT ${field("edition")},${field("id")},'ISBN ' || ${field("isbn")},${field("isbn")} FROM json_each(?1) j
 WHERE ${field("isbn")} IS NOT NULL AND NOT EXISTS(SELECT 1 FROM editions e WHERE e.isbn=${field("isbn")} AND e.book=${field("id")})`,
];
/**
 * The one catalog import: creates or updates every book in the reviewed file
 * with its details, ISBN edition and seed binding, then replaces both lists'
 * membership and order. Conflicts are found before the first write. Books
 * absent from the file stay; removal is explicit through removeCatalogBooks.
 */
export async function importCatalog(
  env: Env,
  input: unknown,
  progress: (event: Row) => void = () => {},
) {
  const data = catalogData.parse(input);
  const keys = new Map<string, string>();
  const books = [];
  for (const b of data.books) {
    const { identity, bookId } = await catalogBookIdentity(b.title, b.authors);
    const other = keys.get(identity);
    if (other) fail(`Catalog books ${other} and ${b.key} are one work`, 409);
    keys.set(identity, b.key);
    books.push({ ...b, identity, id: bookId });
  }
  let created = 0;
  for (const chunk of chunked(books)) {
    const [existing, bound, editions] = await env.DB.batch<Row>([
      statement(
        env,
        "SELECT id,identity FROM books WHERE identity IN (SELECT value FROM json_each(?))",
        JSON.stringify(chunk.map((b) => b.identity)),
      ),
      statement(
        env,
        "SELECT s.seed_id,s.book_id,b.identity FROM seed_catalog s JOIN books b ON b.id=s.book_id WHERE s.seed_id IN (SELECT value FROM json_each(?1)) OR b.identity IN (SELECT value FROM json_each(?2))",
        JSON.stringify(chunk.map((b) => b.key)),
        JSON.stringify(chunk.map((b) => b.identity)),
      ),
      statement(
        env,
        "SELECT e.isbn,b.identity FROM editions e JOIN books b ON b.id=e.book WHERE e.isbn IN (SELECT value FROM json_each(?))",
        JSON.stringify(chunk.flatMap((b) => b.isbn13 ?? [])),
      ),
    ]);
    const ids = new Map(existing.results.map((r) => [r.identity, r.id]));
    for (const b of chunk) {
      const existingId = ids.get(b.identity);
      if (existingId) b.id = existingId;
      else created++;
    }
    for (const r of bound.results) {
      const key = keys.get(r.identity);
      if (key !== r.seed_id)
        fail(
          key && chunk.some((b) => b.key === key)
            ? `Catalog book ${key} is already bound to key ${r.seed_id}`
            : `Catalog key ${r.seed_id} is bound to a different book: ${r.book_id}`,
          409,
        );
    }
    for (const r of editions.results)
      if (chunk.find((b) => b.isbn13 === r.isbn)!.identity !== r.identity)
        fail(`ISBN ${r.isbn} belongs to a different book`, 409);
  }
  progress({ step: "validated", books: books.length, created });
  let done = 0;
  for (const chunk of chunked(books)) {
    const payload = JSON.stringify(
      chunk.map((b) => ({
        id: b.id,
        identity: b.identity,
        key: b.key,
        title: b.title,
        authors: JSON.stringify(b.authors),
        genres: JSON.stringify(b.genres),
        classification: b.classification,
        year: b.firstPublicationYear,
        provenance: JSON.stringify(b.source),
        series: b.series?.name ?? null,
        seriesNumber: b.series?.number ?? null,
        language: b.originalLanguage,
        premise: b.premise,
        isbn: b.isbn13,
        edition: id("ed"),
      })),
    );
    await env.DB.batch(
      IMPORT_BOOKS.map((sql, i) =>
        i ? statement(env, sql, payload) : statement(env, sql, payload, now()),
      ),
    );
    done += chunk.length;
    progress({ step: "books", done, total: books.length });
  }
  const lists = [];
  for (const slug of catalogListSlugs) {
    const l = data.lists[slug];
    const members = books.filter((b) => b.ranks[slug] !== undefined);
    // One transaction replaces the list, so readers never see a partial order.
    await env.DB.batch([
      statement(
        env,
        `INSERT INTO catalog_lists VALUES(?,?,?,?,?) ON CONFLICT(slug) DO UPDATE SET title=excluded.title,window_start=excluded.window_start,window_end=excluded.window_end,method=excluded.method`,
        slug,
        l.title,
        l.windowStart,
        l.windowEnd,
        l.method,
      ),
      statement(env, "DELETE FROM catalog_list_members WHERE list=?", slug),
      ...chunked(members).map((chunk) =>
        statement(
          env,
          `INSERT INTO catalog_list_members(list,book,evidence_order,provenance) SELECT ?1,${field("id")},${field("rank")},${field("provenance")} FROM json_each(?2) j`,
          slug,
          JSON.stringify(
            chunk.map((b) => ({
              id: b.id,
              rank: b.ranks[slug],
              provenance: JSON.stringify(b.source),
            })),
          ),
        ),
      ),
    ]);
    lists.push({ slug, members: members.length });
    progress({ step: "list", slug, members: members.length });
  }
  return { books: books.length, created, lists };
}
export const bookDetails = (env: Env, book: string) =>
  first(env, "SELECT * FROM book_details WHERE book=?", book);
export const catalogLists = (env: Env) =>
  rows(env, "SELECT * FROM catalog_lists ORDER BY slug");
const STUDIO = "(SELECT user_id FROM seed_studio)";
// Reader and research data that a catalog removal must never destroy.
const READER_DATA = `SELECT
 (SELECT count(*) FROM posts WHERE book=?1 AND owner IS NOT ${STUDIO})
 +(SELECT count(*) FROM drafts WHERE book=?1 AND owner IS NOT ${STUDIO})
 +(SELECT count(*) FROM assets WHERE book=?1 AND owner IS NOT ${STUDIO})
 +(SELECT count(*) FROM contributions WHERE book=?1)
 +(SELECT count(*) FROM shelf WHERE book=?1)
 +(SELECT count(*) FROM jobs WHERE book=?1)
 +(SELECT count(*) FROM index_requests WHERE book=?1)
 +(SELECT count(*) FROM candidates WHERE book=?1)
 +(SELECT count(*) FROM reports WHERE target=?1 OR target IN (SELECT id FROM posts WHERE book=?1))
 +(SELECT count(*) FROM upvotes WHERE post IN (SELECT id FROM posts WHERE book=?1))
 +(SELECT count(*) FROM favorites WHERE post IN (SELECT id FROM posts WHERE book=?1))
 +(SELECT count(*) FROM comments WHERE post IN (SELECT id FROM posts WHERE book=?1))
 +(SELECT count(*) FROM sparks_ledger WHERE post IN (SELECT id FROM posts WHERE book=?1))
 +(SELECT count(*) FROM notifications WHERE post IN (SELECT id FROM posts WHERE book=?1)) AS n`;
// Every row owned by a seeded book, children first. One D1 batch is one transaction.
const REMOVAL = [
  "DELETE FROM seed_posts WHERE draft_id IN (SELECT id FROM drafts WHERE book=?1)",
  "DELETE FROM receipts WHERE resource=?1 OR resource IN (SELECT id FROM assets WHERE book=?1) OR resource IN (SELECT id FROM drafts WHERE book=?1)",
  "DELETE FROM posts WHERE book=?1",
  "DELETE FROM drafts WHERE book=?1",
  "DELETE FROM context_facts WHERE book=?1",
  "DELETE FROM facts WHERE book=?1",
  "DELETE FROM evidence_catalog WHERE book=?1",
  "DELETE FROM context_sources WHERE book=?1",
  "DELETE FROM sources WHERE book=?1",
  "DELETE FROM context_aliases WHERE book=?1",
  "DELETE FROM aliases WHERE character IN (SELECT id FROM characters WHERE book=?1)",
  "DELETE FROM context_subjects WHERE book=?1",
  "DELETE FROM characters WHERE book=?1",
  "DELETE FROM passage_cues WHERE book=?1",
  "DELETE FROM anchors WHERE book=?1",
  "DELETE FROM context_chapters WHERE book=?1",
  "DELETE FROM chapters WHERE book=?1",
  "DELETE FROM page_map WHERE edition IN (SELECT id FROM editions WHERE book=?1)",
  "DELETE FROM editions WHERE book=?1",
  "DELETE FROM work_identities WHERE book=?1",
  "DELETE FROM assets WHERE book=?1",
  "DELETE FROM context_imports WHERE book=?1",
  "DELETE FROM context_approvals WHERE book=?1",
  "DELETE FROM book_covers WHERE book=?1",
  "DELETE FROM book_details WHERE book=?1",
  "DELETE FROM catalog_list_members WHERE book=?1",
  "DELETE FROM seed_catalog WHERE book_id=?1",
  "DELETE FROM book_search WHERE id=?1",
  "DELETE FROM books WHERE id=?1",
  "DELETE FROM site_documents WHERE book=?1 OR (kind='book' AND id=?1)",
];
async function deletePrefix(env: Env, prefix: string) {
  let deleted = 0;
  for (let cursor: string | undefined; ;) {
    const page = await env.MEDIA.list({ prefix, cursor });
    if (page.objects.length) {
      await env.MEDIA.delete(page.objects.map((o) => o.key));
      deleted += page.objects.length;
    }
    if (!page.truncated) return deleted;
    cursor = page.cursor;
  }
}
/**
 * Remove a seeded catalog book and everything Fanflare derived for it: list
 * membership, details, cover history and renditions, studio artwork and media,
 * context facts and search documents. Refuses books with any reader or research
 * data. Retries converge: an absent book only re-purges its cover prefix.
 */
export async function removeCatalogBook(
  env: Env,
  input: { bookId: string; title: string },
) {
  const { bookId, title } = input;
  const book = await first(env, "SELECT title FROM books WHERE id=?", bookId);
  const coverPrefix = `covers/${encodeURIComponent(bookId)}/`;
  if (!book)
    return {
      bookId,
      status: "absent",
      objects: await deletePrefix(env, coverPrefix),
    };
  if (book.title !== title)
    fail(`Removal title differs from D1: ${bookId}`, 409);
  if (!(await first(env, "SELECT 1 FROM seed_catalog WHERE book_id=?", bookId)))
    fail(`Only seeded catalog books can be removed: ${bookId}`, 409);
  const reader = await statement(env, READER_DATA, bookId).first<{
    n: number;
  }>();
  if (reader!.n) fail(`Book has reader or research data: ${bookId}`, 409);
  const counts = (await statement(
    env,
    `SELECT (SELECT count(*) FROM posts WHERE book=?1) posts,(SELECT count(*) FROM facts WHERE book=?1) facts,(SELECT count(*) FROM characters WHERE book=?1) characters,(SELECT count(*) FROM book_covers WHERE book=?1) covers,(SELECT count(*) FROM catalog_list_members WHERE book=?1) memberships`,
    bookId,
  ).first())!;
  const assets = await rows(env, "SELECT id FROM assets WHERE book=?", bookId);
  await env.DB.batch(REMOVAL.map((sql) => statement(env, sql, bookId)));
  let objects = await deletePrefix(env, coverPrefix);
  for (const a of assets) objects += await deletePrefix(env, `${a.id}/`);
  await purgeImages(env, [
    coverTag(bookId),
    ...assets.map((a) => artTag(a.id)),
  ]);
  return {
    bookId,
    status: "removed",
    ...counts,
    assets: assets.length,
    objects,
  };
}
export async function removeCatalogBooks(env: Env, input: unknown) {
  const data = catalogRemoval.parse(input);
  const results = [];
  for (const b of data.books) results.push(await removeCatalogBook(env, b));
  return results;
}
