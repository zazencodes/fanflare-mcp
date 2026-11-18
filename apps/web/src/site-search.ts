import type { Avatar } from "../../../packages/contracts/social.ts";
import { z } from "zod";
import { searchOptions } from "../../../packages/contracts/community.ts";
import { type Env, type Row, rows, statement } from "./common.ts";
import type { ReaderPrefs } from "./prefs.ts";
import { postVisibilitySql, characterVisibilitySql } from "./visibility.ts";
const catalogSearchOptions = searchOptions.extend({
  genre: z.string().max(100).optional(),
  list: z.string().max(100).optional(),
  sort: z.enum(["relevance", "recent", "popular"]).default("relevance"),
  page: z.number().int().min(1).max(10000).default(1),
});
export type SearchOptions = z.input<typeof catalogSearchOptions>;
export type SearchKind = "book" | "character" | "artwork" | "person";
export type SearchPerson = {
  id: string;
  handle: string;
  displayName: string;
  avatar: Avatar;
};
export async function upsertSearchDocument(
  env: Env,
  kind: SearchKind,
  id: string,
): Promise<void> {
  await env.DB.batch([
    statement(
      env,
      "DELETE FROM site_documents WHERE kind=? AND id=?",
      kind,
      id,
    ),
    statement(
      env,
      "INSERT INTO site_documents SELECT * FROM site_source_documents WHERE kind=? AND id=?",
      kind,
      id,
    ),
  ]);
}
export async function removeSearchDocument(
  env: Env,
  kind: SearchKind,
  id: string,
): Promise<void> {
  await statement(
    env,
    "DELETE FROM site_documents WHERE kind=? AND id=?",
    kind,
    id,
  ).run();
}
export async function rebuildSiteSearch(env: Env): Promise<void> {
  await env.DB.batch([
    statement(env, "DELETE FROM site_documents"),
    statement(env, "DELETE FROM site_fts"),
    statement(env, "DELETE FROM site_trigram"),
    statement(
      env,
      "INSERT INTO site_documents SELECT * FROM site_source_documents",
    ),
  ]);
}
export interface SiteSearchResult {
  groups: Record<SearchKind, Row[]>;
  counts: Record<SearchKind, number>;
}
const fold = (s: string) =>
  s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
function typoMatch(word: string, term: string): boolean {
  const max = Math.min(2, Math.floor(term.length / 4));
  if (!max || Math.abs(word.length - term.length) > max) return false;
  let previous = Array.from({ length: term.length + 1 }, (_, i) => i);
  for (let i = 1; i <= word.length; i++) {
    const current = [i];
    for (let j = 1; j <= term.length; j++)
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + +(word[i - 1] !== term[j - 1]),
      );
    previous = current;
  }
  return previous[term.length] <= max;
}
export async function siteSearch(
  env: Env,
  prefs: ReaderPrefs,
  options: SearchOptions,
): Promise<SiteSearchResult> {
  const o = catalogSearchOptions.parse(options),
    terms = o.query.match(/[\p{L}\p{N}]+/gu) ?? [];
  const result: SiteSearchResult = {
    groups: { book: [], character: [], artwork: [], person: [] },
    counts: { book: 0, character: 0, artwork: 0, person: 0 },
  };
  if (!terms.length) return result;
  const prefix = terms.map((t) => '"' + t + '"*').join(" AND ");
  const conditions: string[] = [],
    args: unknown[] = [];
  if (o.kind) {
    conditions.push("kind=?");
    args.push(o.kind);
  }
  if (o.book) {
    conditions.push("book=?");
    args.push(o.book);
  }
  const where = conditions.length ? " AND " + conditions.join(" AND ") : "";
  const candidates = await rows(
    env,
    `SELECT kind,id,bm25(site_fts,0,0,0,8,5,1) rank FROM site_fts WHERE site_fts MATCH ?${where} ORDER BY rank,id`,
    prefix,
    ...args,
  );
  // Trigrams recover partial/mistyped words with an unchanged three-letter span.
  const trigrams = [
    ...new Set(
      terms.flatMap((t) =>
        Array.from({ length: Math.max(0, t.length - 2) }, (_, i) =>
          t.slice(i, i + 3),
        ),
      ),
    ),
  ];
  if (trigrams.length)
    candidates.push(
      ...(await rows(
        env,
        `SELECT kind,id,bm25(site_trigram,0,0,0,8,5,1) rank FROM site_trigram WHERE site_trigram MATCH ?${where} ORDER BY rank,id`,
        trigrams.map((t) => '"' + t + '"').join(" OR "),
        ...args,
      )),
    );
  // Resolve all candidates in a bounded number of D1 queries, including accurate per-kind counts.
  const ids = (kind: SearchKind) =>
    JSON.stringify([
      ...new Set(candidates.filter((c) => c.kind === kind).map((c) => c.id)),
    ]);
  const pv = postVisibilitySql(prefs),
    cv = characterVisibilitySql(prefs);
  const books = await rows(
    env,
    "SELECT b.id,b.title,b.authors,COALESCE(d.genres,'[]') genres,d.series FROM books b LEFT JOIN book_details d ON d.book=b.id WHERE b.id IN (SELECT value FROM json_each(?))",
    ids("book"),
  );
  const characters = await rows(
    env,
    `SELECT c.id,c.name,c.book,b.title bookTitle FROM characters c JOIN books b ON b.id=c.book WHERE c.id IN (SELECT value FROM json_each(?)) AND ${cv.sql} AND NOT EXISTS(SELECT 1 FROM context_subjects subject WHERE subject.subject=c.id AND subject.kind='place')`,
    ids("character"),
    ...cv.args,
  );
  const artwork = await rows(
    env,
    `SELECT p.id,p.book,p.asset assetId,p.owner ownerUserId,p.approved,p.metadata,a.width,a.height,b.title bookTitle,(SELECT count(*) FROM upvotes WHERE post=p.id) upvoteCount FROM posts p JOIN assets a ON a.id=p.asset JOIN books b ON b.id=p.book WHERE p.id IN (SELECT value FROM json_each(?)) AND ${pv.sql}`,
    ids("artwork"),
    ...pv.args,
  );
  const people = (
    await rows(
      env,
      "SELECT p.id,profile.handle,profile.display_name displayName,profile.avatar FROM search_people p JOIN user u ON u.id=p.id JOIN profiles profile ON profile.user_id=p.id WHERE profile.handle IS NOT NULL AND profile.private=0 AND p.id IN (SELECT value FROM json_each(?))",
      ids("person"),
    )
  ).map((r) => ({ ...r, avatar: JSON.parse(r.avatar) }) as SearchPerson);
  const aliases = await rows(
    env,
    "SELECT a.character,a.name FROM aliases a JOIN characters c ON c.id=a.character WHERE c.id IN (SELECT value FROM json_each(?)) AND (?=0 OR a.reveal<=(SELECT CAST(value AS INTEGER) FROM json_each(?) WHERE key=c.book AND type='integer'))",
    ids("character"),
    +prefs.spoilersHidden,
    JSON.stringify(prefs.positions),
  );
  const tags = await rows(
    env,
    `SELECT p.id post,c.id,c.name FROM posts p,json_each(p.metadata,'$.character_ids') j JOIN characters c ON c.id=j.value WHERE p.id IN (SELECT value FROM json_each(?)) AND c.book=p.book AND ${cv.sql} AND NOT EXISTS(SELECT 1 FROM context_subjects subject WHERE subject.subject=c.id AND subject.kind='place')`,
    JSON.stringify(artwork.map((p) => p.id)),
    ...cv.args,
  );
  const verified = new Map<string, { record: Row; searchable: string }>();
  for (const record of books) {
    record.authors = JSON.parse(record.authors);
    verified.set("book:" + record.id, {
      record,
      searchable:
        record.title +
        " " +
        record.authors.join(" ") +
        " " +
        JSON.parse(record.genres).join(" ") +
        " " +
        (record.series ?? ""),
    });
  }
  for (const record of characters)
    verified.set("character:" + record.id, {
      record,
      searchable:
        record.name +
        " " +
        record.bookTitle +
        " " +
        aliases
          .filter((a) => a.character === record.id)
          .map((a) => a.name)
          .join(" "),
    });
  for (const record of artwork) {
    const m = JSON.parse(record.metadata);
    delete record.metadata;
    const names = tags
      .filter((c) => c.post === record.id)
      .map((c) => ({ id: c.id, name: c.name }));
    Object.assign(record, {
      alt: m.alt,
      credit: m.credit,
      style: m.style ?? null,
      mood: m.mood ?? null,
      characters: names,
    });
    if ((o.style && m.style !== o.style) || (o.mood && m.mood !== o.mood))
      continue;
    verified.set("artwork:" + record.id, {
      record,
      searchable: [
        m.alt,
        m.style,
        m.mood,
        m.credit,
        m.description,
        JSON.stringify(m.tags ?? []),
        ...names.map((c) => c.name),
      ]
        .filter(Boolean)
        .join(" "),
    });
  }
  for (const record of people)
    verified.set("person:" + record.id, {
      record,
      searchable: record.handle + " " + record.displayName,
    });
  const eligibleBooks =
    o.genre || o.list
      ? new Set(
          (
            await rows(
              env,
              `SELECT b.id FROM books b LEFT JOIN book_details d ON d.book=b.id
     WHERE (? IS NULL OR EXISTS(SELECT 1 FROM json_each(d.genres) WHERE value=?))
     AND (? IS NULL OR EXISTS(SELECT 1 FROM catalog_list_members m WHERE m.book=b.id AND m.list=?))`,
              o.genre ?? null,
              o.genre ?? null,
              o.list ?? null,
              o.list ?? null,
            )
          ).map((b) => b.id),
        )
      : null;
  const matched: Record<SearchKind, Row[]> = {
    book: [],
    character: [],
    artwork: [],
    person: [],
  };
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const kind = candidate.kind as SearchKind,
      key = kind + ":" + candidate.id;
    if (seen.has(key)) continue;
    seen.add(key);
    const current = verified.get(key);
    if (!current) continue;
    const { record, searchable } = current;
    if (
      !record ||
      (o.book && (kind === "book" ? record.id : record.book) !== o.book)
    )
      continue;
    if ((o.style || o.mood) && kind !== "artwork") continue;
    if (
      (o.genre || o.list) &&
      !eligibleBooks?.has(kind === "book" ? record.id : record.book)
    )
      continue;
    const text = fold(searchable),
      words = text.match(/[\p{L}\p{N}]+/gu) ?? [];
    // Recheck matching against current public fields too: stale/private aliases cannot confer a match.
    if (
      !terms.every((term) => {
        const t = fold(term);
        return words.some((w) => w.startsWith(t) || typoMatch(w, t));
      })
    )
      continue;
    result.counts[kind]++;
    matched[kind].push(record);
  }
  if (o.sort !== "relevance")
    matched.artwork.sort(
      (a, b) =>
        (o.sort === "popular" ? b.upvoteCount - a.upvoteCount : 0) ||
        b.approved - a.approved ||
        String(a.id).localeCompare(String(b.id)),
    );
  for (const kind of Object.keys(matched) as SearchKind[])
    result.groups[kind] = matched[kind].slice(
      (o.page - 1) * o.limit,
      o.page * o.limit,
    );
  return result;
}

// Alternatives come only from current catalog identity. Never echo an indexed
// description or hidden character name into an empty-result page.
export async function searchAlternatives(
  env: Env,
  prefs: ReaderPrefs,
  query: string,
): Promise<string[]> {
  const terms = fold(query).match(/[\p{L}\p{N}]+/gu) ?? [];
  const grams = [
    ...new Set(
      terms.flatMap((t) =>
        Array.from({ length: Math.max(0, t.length - 2) }, (_, i) =>
          t.slice(i, i + 3),
        ),
      ),
    ),
  ];
  if (!grams.length) return [];
  const candidates = await rows(
    env,
    `SELECT id FROM site_trigram WHERE site_trigram MATCH ? AND kind='book' ORDER BY bm25(site_trigram),id LIMIT 8`,
    grams.map((t) => '"' + t + '"').join(" OR "),
  );
  const books = await rows(
    env,
    "SELECT title FROM books WHERE id IN (SELECT value FROM json_each(?)) ORDER BY title",
    JSON.stringify(candidates.map((c) => c.id)),
  );
  const alternatives: string[] = [];
  for (const book of books) {
    if (fold(book.title) === fold(query)) continue;
    const checked = await siteSearch(env, prefs, {
      query: book.title,
      kind: "book",
      limit: 1,
    });
    if (checked.counts.book && !alternatives.includes(book.title))
      alternatives.push(book.title);
    if (alternatives.length === 3) break;
  }
  return alternatives;
}

const request = z.object({
  q: z.string().max(300).default(""),
  tab: z.enum(["all", "book", "artwork", "character", "person"]).default("all"),
  genre: z.string().max(100).optional(),
  list: z.string().max(100).optional(),
  book: z.string().max(200).optional(),
  style: z.string().max(100).optional(),
  mood: z.string().max(100).optional(),
  sort: z.enum(["relevance", "recent", "popular"]).default("relevance"),
  page: z.coerce.number().int().min(1).max(10000).default(1),
});
function parseSearchRequest(input: Record<string, string>) {
  return request.parse(
    Object.fromEntries(
      Object.entries(input).filter(
        ([key, value]) => value !== "" || key === "q",
      ),
    ),
  );
}
/** Ranked search and its viewer use the same verified result order and filters. */
export async function searchCanvasNeighbours(
  env: Env,
  prefs: ReaderPrefs,
  post: string,
  input: Record<string, string>,
) {
  const query = parseSearchRequest(input);
  let previous: Row | null = null,
    found = false,
    page = 1;
  for (; ; page++) {
    const result = await siteSearch(env, prefs, {
      ...query,
      query: query.q,
      page,
      limit: 100,
    });
    for (const item of result.groups.artwork) {
      if (found) return { query, neighbours: { previous, next: item } };
      if (item.id === post) found = true;
      else previous = item;
    }
    if (page * 100 >= result.counts.artwork) break;
  }
  return {
    query,
    neighbours: { previous: found ? previous : null, next: null },
  };
}
export async function searchPageQuery(
  env: Env,
  prefs: ReaderPrefs,
  input: Record<string, string>,
) {
  const query = parseSearchRequest(input);
  const options: SearchOptions = { ...query, query: query.q, limit: 20 };
  // All groups are verified and counted together so tabs retain their counts.
  const result = await siteSearch(env, prefs, options);
  const total = Object.values(result.counts).reduce((a, b) => a + b, 0);
  const alternatives =
    query.q && !total ? await searchAlternatives(env, prefs, query.q) : [];
  return { query, result, total, alternatives };
}
