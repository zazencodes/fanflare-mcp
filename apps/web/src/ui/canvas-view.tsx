import { Hono } from "hono";
import type { Child } from "hono/jsx";
import { z } from "zod";
import { canvasOptions } from "../../../../packages/contracts/community.ts";
import { queryCanvas, type CanvasItem, type CanvasScope } from "../canvas.ts";
import { fail, required, rows } from "../common.ts";
import { artUrl } from "../images.ts";
import { type App, type Web, reader } from "../view.tsx";
import { Canvas, ArtworkTile, EndlessLoader, SwapRegion } from "./canvas.tsx";

// One path for every artwork canvas (home, explore, book, profile, favorites):
// canvasQuery reads the URL, canvasSection renders the first page on the server, and
// GET /api/canvas returns later pages as fragments for /js/endless.js.

const queryOptions = canvasOptions.pick({
  sort: true,
  seed: true,
  filters: true,
  cursor: true,
});
type ProfileCanvasScope = CanvasScope & { handle?: string };
export type CanvasQuery = z.infer<typeof queryOptions>;

/**
 * Read sort, seed, style, mood, character, q and cursor from the request.
 * Random sort without a seed gets a fresh one, which every link built from the query carries.
 */
export function canvasQuery(c: Web): CanvasQuery {
  const read = (key: string) => c.req.query(key) || undefined;
  const query = queryOptions.parse({
    sort: read("sort"),
    seed: read("seed"),
    filters: {
      book: read("book"),
      style: read("style"),
      mood: read("mood"),
      character: read("character"),
      text: read("q"),
    },
    cursor: read("cursor"),
  });
  if (query.sort === "random" && !query.seed)
    query.seed = crypto.randomUUID().replaceAll("-", "").slice(0, 10);
  return query;
}

/** The query as URL parameters (sort always explicit, cursor excluded). */
export function canvasParams(query: CanvasQuery): Record<string, string> {
  const params: Record<string, string> = { sort: query.sort };
  if (query.seed) params.seed = query.seed;
  for (const key of ["book", "style", "mood", "character"] as const)
    if (query.filters[key]) params[key] = query.filters[key];
  if (query.filters.text) params.q = query.filters.text;
  return params;
}

/** The `scope` URL parameter: site, book:<id> or favorites. */
export function scopeParam(scope: ProfileCanvasScope): string {
  switch (scope.kind) {
    case "site":
      return "site";
    case "book":
      return "book:" + scope.book;
    case "favorites":
      return "favorites";
    case "owner":
      if (!scope.handle) throw new Error("Profile scope requires a handle");
      return "profile:" + scope.handle;
  }
}

/** The canonical page for a scope; its URL with a cursor is the no-script next page. */
export function canvasPage(scope: ProfileCanvasScope): string {
  switch (scope.kind) {
    case "site":
      return "/explore";
    case "book":
      return "/books/" + encodeURIComponent(scope.book);
    case "favorites":
      return "/me/favorites";
    case "owner":
      if (!scope.handle) throw new Error("Profile scope requires a handle");
      return "/u/" + encodeURIComponent(scope.handle);
  }
}

export async function parseCanvasScope(
  c: Web,
  value = "",
): Promise<ProfileCanvasScope> {
  if (value === "site") return { kind: "site" };
  if (value === "favorites") return { kind: "favorites", userId: reader(c).id };
  if (value.startsWith("book:")) {
    const book = value.slice(5);
    await required(c.env, "SELECT id FROM books WHERE id=?", book);
    return { kind: "book", book };
  }
  if (value.startsWith("profile:")) {
    const handle = value.slice(8);
    // A private profile's art canvas is its owner's alone.
    const p = await required(
      c.env,
      "SELECT user_id FROM profiles WHERE handle=? AND (private=0 OR user_id=?)",
      handle,
      c.get("reader")?.id ?? null,
    );
    return { kind: "owner", userId: p.user_id, handle };
  }
  fail("Canvas scope must be site, book:<id>, profile:<handle> or favorites");
}

const canvasId = (scope: ProfileCanvasScope) => "canvas-" + scope.kind;
const qs = (params: Record<string, string>) =>
  new URLSearchParams(params).toString();

async function loadPage(
  c: Web,
  scope: ProfileCanvasScope,
  limit?: number,
  query = canvasQuery(c),
) {
  const page = await queryCanvas(
    c.env,
    c.get("prefs"),
    { scope, ...query, limit },
    c.get("reader")?.id,
  );
  return { query, ...page };
}

export type ArtworkTileItem = Pick<
  CanvasItem,
  | "id"
  | "assetId"
  | "width"
  | "height"
  | "alt"
  | "credit"
  | "upvoteCount"
  | "ownerUserId"
>;
/** Shared public attribution and reader actions for every canvas, including ranked search. */
export async function artworkTiles(
  c: Web,
  items: ArtworkTileItem[],
  options: { viewer?: string; next?: string } = {},
) {
  const ids = items.map((item) => item.id),
    user = c.get("reader")?.id;
  const social = ids.length
    ? await rows(
        c.env,
        `SELECT p.id,pr.handle,pr.private,pr.avatar,
    EXISTS(SELECT 1 FROM upvotes u WHERE u.post=p.id AND u.user_id=?) voted,
    EXISTS(SELECT 1 FROM favorites f WHERE f.post=p.id AND f.user_id=?) favorited
    FROM posts p LEFT JOIN profiles pr ON pr.user_id=p.owner WHERE p.id IN (SELECT value FROM json_each(?))`,
        user ?? null,
        user ?? null,
        JSON.stringify(ids),
      )
    : [];
  const states = new Map(social.map((row) => [row.id, row]));
  return (
    <>
      {items.map((item) => {
        if (!item.width || !item.height)
          throw Error(
            "Post " +
              item.id +
              " has no stored dimensions; run scripts/backfill-dimensions.mjs",
          );
        const post = encodeURIComponent(item.id),
          state = states.get(item.id);
        const permalink =
          "/posts/" + post + (options.viewer ? "?" + options.viewer : "");
        return (
          <ArtworkTile
            id={item.id}
            href={permalink}
            src={artUrl(item.assetId, "thumb")}
            width={item.width}
            height={item.height}
            alt={item.alt}
            artist={{
              name: item.credit,
              profile: state?.handle
                ? {
                    handle: state.handle,
                    avatar: JSON.parse(state.avatar),
                    private: !!state.private,
                  }
                : null,
            }}
            upvotes={{
              count: item.upvoteCount,
              pressed: !!state?.voted,
              action: user ? "/api/upvote" : undefined,
              disabled: user === item.ownerUserId,
            }}
            favorite={
              user
                ? { pressed: !!state?.favorited, action: "/api/favorite" }
                : undefined
            }
            next={options.next ?? permalink}
            fragment={
              options.viewer
                ? "/api/posts/" + post + "/viewer?" + options.viewer
                : undefined
            }
          />
        );
      })}
    </>
  );
}
function canvasTiles(
  c: Web,
  scope: ProfileCanvasScope,
  query: CanvasQuery,
  items: CanvasItem[],
) {
  return artworkTiles(c, items, {
    viewer: qs({ scope: scopeParam(scope), ...canvasParams(query) }),
  });
}

function Loader({
  scope,
  query,
  cursor,
}: {
  scope: ProfileCanvasScope;
  query: CanvasQuery;
  cursor: string | null;
}) {
  const params = canvasParams(query);
  return (
    <EndlessLoader
      target={canvasId(scope)}
      next={
        cursor
          ? {
              href: canvasPage(scope) + "?" + qs({ ...params, cursor }),
              fragment:
                "/api/canvas?" +
                qs({ scope: scopeParam(scope), ...params, cursor }),
            }
          : undefined
      }
    />
  );
}

/** The URL parameters an in-place canvas region reads and writes, in canonical order. */
export const canvasKeys = [
  "sort",
  "seed",
  "book",
  "style",
  "mood",
  "character",
  "q",
];

/**
 * The first page of a canvas. `empty` renders above the (empty) canvas when there is no
 * art at all, so fresh uploads still have a canvas to land in. An endless canvas is an
 * in-place region (/js/swap.js): sort and filter controls replace its tiles from
 * GET /api/canvas without leaving the page. A bounded preview (`endless: false`) can pass
 * its own `query` and `id` so one page can hold several.
 */
export async function canvasSection(
  c: Web,
  {
    scope,
    label,
    empty,
    limit,
    endless = true,
    query,
    id = canvasId(scope),
  }: {
    scope: ProfileCanvasScope;
    label: string;
    empty?: Child;
    limit?: number;
    endless?: boolean;
    query?: CanvasQuery;
    id?: string;
  },
) {
  const page = await loadPage(c, scope, limit, query);
  const blank = !page.items.length && !page.query.cursor;
  const canvas = (
    <Canvas id={id} label={label}>
      {await canvasTiles(c, scope, page.query, page.items)}
    </Canvas>
  );
  if (!endless)
    return (
      <>
        {blank && empty}
        {canvas}
      </>
    );
  return (
    <SwapRegion
      page={canvasPage(scope)}
      fragment={"/api/canvas?" + qs({ scope: scopeParam(scope) })}
      keys={canvasKeys}
      empty={empty}
      blank={blank}
    >
      {canvas}
      <Loader scope={scope} query={page.query} cursor={page.cursor} />
    </SwapRegion>
  );
}

export const canvasRoutes = new Hono<App>();
canvasRoutes.get("/api/canvas", async (c) => {
  const scope = await parseCanvasScope(c, c.req.query("scope"));
  const page = await loadPage(c, scope);
  c.header("Cache-Control", "private, no-store");
  c.header("X-Robots-Tag", "noindex, nofollow");
  return c.html(
    <>
      {await canvasTiles(c, scope, page.query, page.items)}
      <Loader scope={scope} query={page.query} cursor={page.cursor} />
    </>,
  );
});
