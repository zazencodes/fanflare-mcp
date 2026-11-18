import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { z } from "zod";
import { readerPrefs } from "../../../packages/contracts/community.ts";
import { type Env, first, statement, fail } from "./common.ts";
import type { App, Web } from "./view.tsx";
export type ReaderPrefs = z.infer<typeof readerPrefs>;
export const defaultPrefs = (): ReaderPrefs => ({
  spoilersHidden: false,
  positions: {},
});
const cookieName = "fanflare_prefs";
const visitorSchema = z.object({
  spoilersHidden: z.boolean().optional(),
  positions: z
    .record(z.string(), z.number().int().min(0).nullable())
    .optional(),
});
export type VisitorPrefs = z.infer<typeof visitorSchema>;
export function parsePrefsCookie(value?: string): VisitorPrefs {
  if (!value) return {};
  try {
    return visitorSchema.parse(JSON.parse(value));
  } catch {
    return {};
  }
}
// A single SELECT returns the small account record. Merging writes are needed only when a visitor cookie is present.
export async function loadPrefs(
  env: Env,
  userId?: string,
  visitor: VisitorPrefs = {},
): Promise<ReaderPrefs> {
  if (!userId) return readerPrefs.parse(visitor);
  if (Object.keys(visitor).length) {
    await statement(
      env,
      `INSERT INTO reader_preferences(user_id,spoilers_hidden,positions) VALUES(?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET spoilers_hidden=COALESCE(reader_preferences.spoilers_hidden,excluded.spoilers_hidden),
      positions=(SELECT json_group_object(key,value) FROM (SELECT key,value FROM json_each(reader_preferences.positions) UNION ALL SELECT key,value FROM json_each(excluded.positions) WHERE key NOT IN (SELECT key FROM json_each(reader_preferences.positions))))`,
      userId,
      visitor.spoilersHidden === undefined ? null : +visitor.spoilersHidden,
      JSON.stringify(visitor.positions ?? {}),
    ).run();
  }
  const row = await first(
    env,
    "SELECT spoilers_hidden,positions FROM reader_preferences WHERE user_id=?",
    userId,
  );
  return row
    ? {
        spoilersHidden: !!row.spoilers_hidden,
        positions: JSON.parse(row.positions),
      }
    : defaultPrefs();
}
export async function identifyPrefs(c: Web) {
  const value = getCookie(c, cookieName);
  c.set(
    "prefs",
    await loadPrefs(c.env, c.get("reader")?.id, parsePrefsCookie(value)),
  );
  if (value && c.get("reader"))
    deleteCookie(c, cookieName, {
      path: "/",
      secure: new URL(c.req.url).protocol === "https:",
    });
}
export async function setSpoilers(
  env: Env,
  userId: string,
  hidden: boolean,
): Promise<void> {
  await statement(
    env,
    "INSERT INTO reader_preferences(user_id,spoilers_hidden) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET spoilers_hidden=excluded.spoilers_hidden",
    userId,
    +hidden,
  ).run();
}
export async function setPosition(
  env: Env,
  userId: string,
  book: string,
  chapter: number | null,
): Promise<void> {
  const point = await resolvePosition(env, book, chapter);
  await statement(
    env,
    `INSERT INTO reader_preferences(user_id,positions) VALUES(?,json_object(?,?)) ON CONFLICT(user_id) DO UPDATE SET positions=json_set(positions,?,?)`,
    userId,
    book,
    point,
    "$." + JSON.stringify(book),
    point,
  ).run();
}
export async function resolvePosition(
  env: Env,
  book: string,
  chapter: number | null,
): Promise<number | null> {
  if (!(await first(env, "SELECT 1 FROM books WHERE id=?", book)))
    fail("Book unavailable", 404);
  if (chapter === null) return null;
  if (
    !Number.isInteger(chapter) ||
    !(await first(
      env,
      "SELECT 1 FROM chapters WHERE book=? AND ord=?",
      book,
      chapter,
    ))
  )
    fail("Choose a known chapter");
  return chapter * 100000 + 99999;
}
export function prefsNext(origin: string, next: string): string {
  const url = new URL(next || "/", origin);
  if (url.origin !== new URL(origin).origin || url.username || url.password)
    fail("Invalid next path");
  return url.pathname + url.search + url.hash;
}
function saveVisitor(c: Web, visitor: VisitorPrefs) {
  const value = JSON.stringify(visitor);
  if (encodeURIComponent(value).length > 3800)
    fail("Too many saved book positions");
  setCookie(c, cookieName, value, {
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
    secure: new URL(c.req.url).protocol === "https:",
    maxAge: 365 * 86400,
  });
}
export const prefsRoutes = new Hono<App>();
async function updatePrefs(c: Web, action: "spoilers" | "position") {
  const data = await c.req.formData(),
    userId = c.get("reader")?.id;
  const next = prefsNext(c.env.ORIGIN, String(data.get("next") ?? "/"));
  const visitor = parsePrefsCookie(getCookie(c, cookieName));
  if (action === "spoilers") {
    const hidden = z.enum(["1", "0"]).parse(data.get("hidden")) === "1";
    if (userId) await setSpoilers(c.env, userId, hidden);
    else {
      visitor.spoilersHidden = hidden;
      saveVisitor(c, visitor);
    }
  } else {
    const book = c.req.param("book") ?? fail("Book required");
    const value = z.string().parse(data.get("chapter"));
    const chapter = value === "" ? null : Number(value);
    const point = await resolvePosition(c.env, book, chapter);
    if (userId) await setPosition(c.env, userId, book, chapter);
    else {
      visitor.positions = { ...visitor.positions, [book]: point };
      saveVisitor(c, visitor);
    }
  }
  const prefs = await loadPrefs(c.env, userId, visitor);
  c.set("prefs", prefs);
  return c.req.header("Accept")?.includes("application/json")
    ? c.json({ prefs })
    : c.redirect(next, 303);
}
prefsRoutes.post("/api/prefs/spoilers", (c) => updatePrefs(c, "spoilers"));
prefsRoutes.post("/api/prefs/position/:book", (c) =>
  updatePrefs(c, "position"),
);

/** The colour theme is a per-device choice. Without the cookie pages follow prefers-color-scheme. */
export const themes = ["light", "dark"] as const;
export type Theme = (typeof themes)[number];
const themeCookie = "theme";
export function readTheme(c: Web): Theme | null {
  const value = getCookie(c, themeCookie);
  return value === "light" || value === "dark" ? value : null;
}
prefsRoutes.post("/api/prefs/theme", async (c) => {
  const data = await c.req.formData();
  const next = prefsNext(c.env.ORIGIN, String(data.get("next") ?? "/"));
  const theme = z.enum(themes).parse(data.get("theme"));
  setCookie(c, themeCookie, theme, {
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
    secure: new URL(c.req.url).protocol === "https:",
    maxAge: 365 * 86400,
  });
  return c.req.header("Accept")?.includes("application/json")
    ? c.json({ theme })
    : c.redirect(next, 303);
});
