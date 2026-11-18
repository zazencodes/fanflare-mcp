import { z } from "zod";
import {
  canvasOptions,
  canvasScope,
} from "../../../packages/contracts/community.ts";
import { type Env, type Row, rows, first, fail, digest } from "./common.ts";
import type { ReaderPrefs } from "./prefs.ts";
import { postVisibilitySql, characterVisibilitySql } from "./visibility.ts";
export type CanvasScope = z.infer<typeof canvasScope>;
export type CanvasOptions = z.input<typeof canvasOptions>;
export interface CanvasItem {
  id: string;
  bookId: string;
  bookTitle: string;
  assetId: string;
  width: number | null;
  height: number | null;
  alt: string;
  credit: string;
  style: string | null;
  mood: string | null;
  characters: { id: string; name: string }[];
  upvoteCount: number;
  approved: number;
  ownerUserId: string;
}
function scopeSql(scope: CanvasScope, readerId?: string) {
  switch (scope.kind) {
    case "site":
      return { sql: "1=1", args: [] };
    case "book":
      return { sql: "p.book=?", args: [scope.book] };
    case "owner":
      return { sql: "p.owner=?", args: [scope.userId] };
    case "favorites":
      if (readerId !== scope.userId) fail("Favorites are private", 403);
      return {
        sql: "EXISTS(SELECT 1 FROM favorites f WHERE f.post=p.id AND f.user_id=?)",
        args: [scope.userId],
      };
  }
}
async function queryParts(
  env: Env,
  prefs: ReaderPrefs,
  options: CanvasOptions,
  readerId?: string,
) {
  const o = canvasOptions.parse(options),
    v = postVisibilitySql(prefs),
    s = scopeSql(o.scope, readerId);
  const conditions = [v.sql, s.sql],
    args: unknown[] = [...v.args, ...s.args];
  for (const field of ["style", "mood"] as const)
    if (o.filters[field]) {
      conditions.push(`json_extract(p.metadata,'$.${field}')=?`);
      args.push(o.filters[field]);
    }
  if (o.filters.book) {
    conditions.push("p.book=?");
    args.push(o.filters.book);
  }
  if (o.filters.character) {
    conditions.push(
      "EXISTS(SELECT 1 FROM json_each(p.metadata,'$.character_ids') WHERE value=?)",
    );
    args.push(o.filters.character);
  }
  if (o.filters.text) {
    conditions.push(
      "instr(lower(COALESCE(json_extract(p.metadata,'$.alt'),'') || ' ' || COALESCE(json_extract(p.metadata,'$.description'),'') || ' ' || COALESCE(json_extract(p.metadata,'$.tags'),'') || ' ' || COALESCE(json_extract(p.metadata,'$.credit'),'')),lower(?))>0",
    );
    args.push(o.filters.text);
  }
  return { o, where: conditions.join(" AND "), args };
}
const cursorSchema = z.object({
  v: z.literal(1),
  fingerprint: z.string(),
  at: z.number(),
  rank: z.number(),
  approved: z.number(),
  id: z.string(),
});
export async function queryCanvas(
  env: Env,
  prefs: ReaderPrefs,
  options: CanvasOptions,
  readerId?: string,
): Promise<{ items: CanvasItem[]; cursor: string | null }> {
  const { o, where, args } = await queryParts(env, prefs, options, readerId);
  if (o.sort === "random" && !o.seed) fail("Random sort requires a URL seed");
  if (o.sort === "favorited" && o.scope.kind !== "favorites")
    fail("Favorited sort requires favorites scope");
  const fingerprint = await digest(
    JSON.stringify([o.scope, o.sort, o.seed, o.filters, prefs, readerId]),
  );
  let cursor: z.infer<typeof cursorSchema> | undefined;
  if (o.cursor) {
    try {
      cursor = cursorSchema.parse(JSON.parse(atob(o.cursor)));
    } catch {
      fail("Invalid canvas cursor");
    }
    if (cursor.fingerprint !== fingerprint)
      fail("Cursor belongs to another canvas");
  }
  const at = cursor?.at ?? Date.now();
  let rank = "0",
    rankArgs: unknown[] = [];
  if (o.sort === "popular")
    rank = "(SELECT count(*) FROM upvotes u WHERE u.post=p.id)";
  if (o.sort === "trending") {
    rank =
      "(SELECT count(*) FROM upvotes u WHERE u.post=p.id AND u.created>=? AND u.created<=?)";
    rankArgs = [at - 7 * 86400000, at];
  }
  if (o.sort === "favorited") {
    rank =
      "(SELECT created FROM favorites f WHERE f.post=p.id AND f.user_id=?)";
    rankArgs = [o.scope.kind === "favorites" ? o.scope.userId : ""];
  }
  if (o.sort === "random") {
    // Independent seed-derived coefficients produce a deterministic SQL shuffle; id breaks hash collisions.
    const hash = await digest(o.seed!);
    rank =
      "(" +
      Array.from(
        { length: 16 },
        (_, i) =>
          `COALESCE(unicode(substr(p.id,${i + 1},1)),0)*${parseInt((hash + hash).slice(i * 4, i * 4 + 8), 16) + 1}`,
      ).join("+") +
      ") % 2147483647";
  }
  const cv = characterVisibilitySql(prefs);
  const recent = o.sort === "recent";
  const order = recent
    ? "p.approved DESC,p.id DESC"
    : "sort_rank DESC,p.approved DESC,p.id DESC";
  const seek = cursor
    ? recent
      ? "AND (p.approved,p.id)<(?,?)"
      : "AND (sort_rank,p.approved,p.id)<(?,?,?)"
    : "";
  // Narrow the index range to the cursor; SQLite otherwise starts at the snapshot time.
  const through = recent && cursor ? Math.min(at, cursor.approved) : at;
  const data = await rows(
    env,
    `WITH selected AS MATERIALIZED (
      SELECT p.*,${rank} sort_rank FROM posts p
      WHERE ${where} AND p.approved<=? ${seek}
      ORDER BY ${order} LIMIT ?)
    SELECT p.*,b.title book_title,a.width,a.height,
    ${o.sort === "popular" ? "p.sort_rank" : "(SELECT count(*) FROM upvotes u WHERE u.post=p.id)"} votes,
    (SELECT json_group_array(json_object('id',c.id,'name',c.name)) FROM json_each(p.metadata,'$.character_ids') j JOIN characters c ON c.id=j.value WHERE c.book=p.book AND ${cv.sql}) characters
    FROM selected p JOIN books b ON b.id=p.book JOIN assets a ON a.id=p.asset
    ORDER BY ${order}`,
    ...rankArgs,
    ...args,
    through,
    ...(cursor
      ? recent
        ? [cursor.approved, cursor.id]
        : [cursor.rank, cursor.approved, cursor.id]
      : []),
    o.limit + 1,
    ...cv.args,
  );
  const more = data.length > o.limit,
    page = data.slice(0, o.limit),
    last = page.at(-1);
  return {
    items: page.map(tile),
    cursor:
      more && last
        ? btoa(
            JSON.stringify({
              v: 1,
              fingerprint,
              at,
              rank: last.sort_rank,
              approved: last.approved,
              id: last.id,
            }),
          )
        : null,
  };
}
function tile(p: Row): CanvasItem {
  const m = JSON.parse(p.metadata);
  return {
    id: p.id,
    bookId: p.book,
    bookTitle: p.book_title,
    assetId: p.asset,
    width: p.width,
    height: p.height,
    alt: m.alt,
    credit: m.credit,
    style: m.style ?? null,
    mood: m.mood ?? null,
    characters: JSON.parse(p.characters),
    upvoteCount: p.votes,
    approved: p.approved,
    ownerUserId: p.owner,
  };
}
export async function canvasFacets(
  env: Env,
  prefs: ReaderPrefs,
  scope: CanvasScope,
  readerId?: string,
): Promise<{
  styles: string[];
  moods: string[];
  characters: { id: string; name: string }[];
}> {
  const { where, args } = await queryParts(env, prefs, { scope }, readerId),
    cv = characterVisibilitySql(prefs);
  const metadata = await rows(
    env,
    `SELECT DISTINCT json_extract(p.metadata,'$.style') style,json_extract(p.metadata,'$.mood') mood FROM posts p WHERE ${where}`,
    ...args,
  );
  const characters = await rows(
    env,
    `SELECT DISTINCT c.id,c.name FROM posts p,json_each(p.metadata,'$.character_ids') j JOIN characters c ON c.id=j.value WHERE c.book=p.book AND ${where} AND ${cv.sql} ORDER BY c.name,c.id`,
    ...args,
    ...cv.args,
  );
  return {
    styles: [...new Set(metadata.map((m) => m.style).filter(Boolean))].sort(),
    moods: [...new Set(metadata.map((m) => m.mood).filter(Boolean))].sort(),
    characters: characters.map((c) => ({ id: c.id, name: c.name })),
  };
}
export async function canvasNeighbours(
  env: Env,
  prefs: ReaderPrefs,
  postId: string,
  options: CanvasOptions,
  readerId?: string,
): Promise<{
  previous: Pick<CanvasItem, "id"> | null;
  next: Pick<CanvasItem, "id"> | null;
}> {
  const { o, where, args } = await queryParts(env, prefs, options, readerId);
  if (o.sort === "recent") {
    const at = Date.now();
    const adjacent = await first(
      env,
      `WITH current AS MATERIALIZED (
      SELECT p.approved,p.id FROM posts p WHERE p.id=? AND ${where} AND p.approved<=?)
      SELECT
      (SELECT p.id FROM posts p WHERE ${where} AND p.approved<=?
        AND (p.approved,p.id)>(current.approved,current.id)
        ORDER BY p.approved ASC,p.id ASC LIMIT 1) previous,
      (SELECT p.id FROM posts p WHERE ${where} AND p.approved<=current.approved
        AND (p.approved,p.id)<(current.approved,current.id)
        ORDER BY p.approved DESC,p.id DESC LIMIT 1) next
      FROM current`,
      postId,
      ...args,
      at,
      ...args,
      at,
      ...args,
    );
    return {
      previous: adjacent?.previous ? { id: adjacent.previous } : null,
      next: adjacent?.next ? { id: adjacent.next } : null,
    };
  }
  let previous: CanvasItem | null = null,
    found = false,
    cursor: string | undefined;
  do {
    const page = await queryCanvas(
      env,
      prefs,
      { ...options, cursor, limit: 100 },
      readerId,
    );
    for (const item of page.items) {
      if (found) return { previous, next: item };
      if (item.id === postId) found = true;
      else previous = item;
    }
    cursor = page.cursor ?? undefined;
  } while (cursor);
  return found ? { previous, next: null } : { previous: null, next: null };
}
