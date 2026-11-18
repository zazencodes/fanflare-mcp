import { HTTPException } from "hono/http-exception";
import type { Env } from "./common.ts";
import {
  type PublicImage,
  PUBLIC_IMAGE_PREFIX,
  publicImageHeaders,
} from "./images.ts";
import { publicArt } from "./media.ts";
import { publicCover } from "./catalog.ts";
import { publicAvatar } from "./avatars.tsx";
import { imageMissLimit } from "./request-limit.ts";

export const isPublicImageRequest = (request: Request) =>
  (request.method === "GET" || request.method === "HEAD") &&
  new URL(request.url).pathname.startsWith(PUBLIC_IMAGE_PREFIX);

const uncached = (body: string, status: number) =>
  new Response(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });

function find(env: Env, path: string): Promise<PublicImage | null> | null {
  let parts: string[];
  try {
    parts = path
      .slice(PUBLIC_IMAGE_PREFIX.length)
      .split("/")
      .map(decodeURIComponent);
  } catch {
    return null;
  }
  const [kind, subject, ...rest] = parts;
  if (kind === "art" && rest.length === 1)
    return publicArt(env, subject, rest[0]);
  if (kind === "cover" && rest.length === 2)
    return publicCover(env, subject, rest[0], rest[1]);
  if (kind === "avatar" && rest.length === 1)
    return publicAvatar(env, subject, rest[0]);
  return null;
}

const matches = (header: string | null, etag: string) =>
  !!header &&
  header
    .split(",")
    .some(
      (tag) => tag.trim() === "*" || tag.trim().replace(/^W\//, "") === etag,
    );

/**
 * Public image origin handler. Runtime cache hits never reach it.
 * Each miss or revalidation is rate limited per IP and re-checked against D1;
 * the response never depends on cookies, Authorization or reader preferences.
 */
export async function servePublicImage(env: Env, request: Request) {
  try {
    const blocked = await imageMissLimit(request, env);
    if (blocked) return blocked;
    const image = await find(env, new URL(request.url).pathname);
    if (!image) return uncached("Image unavailable", 404);
    const headers = {
      ...publicImageHeaders,
      ETag: image.etag,
      "Cache-Tag": image.tag,
    };
    if (matches(request.headers.get("If-None-Match"), image.etag))
      return new Response(null, { status: 304, headers });
    const { body, type } = await image.body();
    return new Response(request.method === "HEAD" ? null : body, {
      headers: { ...headers, "Content-Type": type },
    });
  } catch (e) {
    if (e instanceof HTTPException) return uncached(e.message, e.status);
    console.error("Public image failed", e instanceof Error ? e.name : "");
    return uncached("The image could not be served.", 500);
  }
}

/** One inbound Worker invocation; cache hits skip D1, R2 and the miss limiter. */
export async function cachedPublicImage(
  env: Env,
  request: Request,
  ctx: ExecutionContext,
) {
  if (!env.ORIGIN.startsWith("https://")) return servePublicImage(env, request);
  const url = new URL(request.url);
  url.search = "";
  const key = new Request(url, { method: "GET" });
  const cache = (caches as unknown as { default: Cache }).default;
  // Revalidations must consult D1, including requests for withdrawn images.
  const cacheControl = request.headers.get("Cache-Control") ?? "";
  const noStore = /(?:^|,)\s*no-store\s*(?:,|$)/i.test(cacheControl);
  const revalidate =
    request.headers.has("If-None-Match") ||
    request.headers.has("If-Modified-Since") ||
    /(?:^|,)\s*(?:no-cache|max-age\s*=\s*"?0"?)\s*(?:,|$)/i.test(
      cacheControl,
    ) ||
    /(?:^|,)\s*no-cache\s*(?:,|$)/i.test(request.headers.get("Pragma") ?? "") ||
    noStore;
  if (!revalidate) {
    const hit = await cache.match(key);
    if (hit)
      return request.method === "HEAD"
        ? new Response(null, { status: hit.status, headers: hit.headers })
        : hit;
  }
  const response = await servePublicImage(env, request);
  if (!noStore && request.method === "GET" && response.status === 200)
    ctx.waitUntil(cache.put(key, response.clone()));
  return response;
}
