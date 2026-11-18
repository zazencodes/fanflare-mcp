import { Hono } from "hono";
import { WorkerEntrypoint } from "cloudflare:workers";
import { HTTPException } from "hono/http-exception";
import { bodyLimit } from "hono/body-limit";
import { ZodError } from "zod";
import { auth } from "./auth.ts";
import { mcpEndpoint } from "./mcp.ts";
import { upload, media } from "./media.ts";
import { type Env, fail } from "./common.ts";
import { type App, identify, page, Heading } from "./view.tsx";
import { requestLimit } from "./request-limit.ts";
import {
  isPublicImageRequest,
  cachedPublicImage,
  servePublicImage,
} from "./public-images.ts";
import type { PublicImagesService } from "./images.ts";
export const app = new Hono<App>();
app.use("*", async (c, next) => {
  c.header("Referrer-Policy", "same-origin");
  c.header("X-Content-Type-Options", "nosniff");
  if (c.env.ORIGIN.startsWith("https://"))
    c.header("Strict-Transport-Security", "max-age=31536000");
  c.header(
    "Content-Security-Policy",
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'",
  );
  await next();
});
app.use("*", async (c, next) => {
  const blocked = await requestLimit(c.req.raw, c.env);
  if (blocked) return blocked;
  await next();
});
app.use(
  "*",
  bodyLimit({
    maxSize: 12 * 1024 * 1024 + 32768,
    onError: (c) => c.text("Upload too large", 413),
  }),
);
app.all("/api/auth/*", (c) => auth(c.env).handler(c.req.raw));
app.get("/.well-known/*", (c) => auth(c.env).handler(c.req.raw));
app.post("/mcp", (c) => mcpEndpoint(c.env, c.req.raw));
app.all("/mcp", (c) => c.text("Use HTTP POST", 405, { Allow: "POST" }));
app.put("/upload/:id", async (c) =>
  c.json(
    await upload(
      c.env,
      c.req.param("id"),
      c.req.query("proof") ?? "",
      c.req.raw.body,
    ),
  ),
);
app.use("*", async (c, next) => {
  if (c.req.path.startsWith("/internal/")) return next();
  if (c.req.method === "POST" && c.req.header("Origin") !== c.env.ORIGIN)
    fail("Form origin denied", 403);
  await identify(c);
  const protectedPath =
    /^\/(account|admin|review|new-book|consent|welcome|me|signed-in|notifications)(\/|$)/.test(
      c.req.path,
    ) || /^\/books\/[^/]+\/(share|contribute)$/.test(c.req.path);
  if (protectedPath && !c.get("reader"))
    return c.redirect(
      "/sign-in?next=" +
        encodeURIComponent(c.req.path + new URL(c.req.url).search),
      303,
    );
  return next();
});
app.get("/media/:id", (c) =>
  media(
    c.env,
    c.req.param("id"),
    c.req.query("thumb") === "1",
    c.get("reader")?.id,
    c.get("moderator"),
  ),
);
app.notFound((c) => {
  c.status(404);
  return page(
    c,
    "Page unavailable",
    <Heading title="Page unavailable" back="/" />,
  );
});
app.onError((e, c) => {
  const status =
    e instanceof HTTPException ? e.status : e instanceof ZodError ? 400 : 500;
  const message =
    e instanceof HTTPException
      ? e.message
      : e instanceof ZodError
        ? e.issues.map((i) => i.path.join(".") + " " + i.message).join(", ")
        : "The request could not be completed.";
  if (status === 500) console.error("Request failed", e.name, c.req.routePath);
  c.status(status);
  if (
    c.req.header("Accept")?.includes("application/json") ||
    c.req.path.startsWith("/api/") ||
    c.req.path.startsWith("/internal/") ||
    c.req.path === "/mcp" ||
    c.req.path.startsWith("/upload/")
  )
    return c.json({ error: message });
  // The Origin guard can fail before reader and preference state exists.
  if (!c.get("prefs")) return c.text(message);
  return page(
    c,
    "Request unavailable",
    <Heading title="Request unavailable" sub={message} back="/" />,
  );
});
// Fence every request, public images included, before anything else runs.
function maintenance(env: Env) {
  if (env.MAINTENANCE === "true")
    return new Response(
      "Fanflare is undergoing maintenance. Please try again shortly.",
      {
        status: 503,
        headers: {
          "Cache-Control": "private, no-store",
          "Retry-After": "60",
          "X-Robots-Tag": "noindex, nofollow",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
}
type Exports = { PublicImages: Fetcher & PublicImagesService };
const exportsOf = (ctx: ExecutionContext) => ctx.exports as unknown as Exports;
export const withImages = (env: Env, ctx: ExecutionContext): Env => ({
  ...env,
  PUBLIC_IMAGES: exportsOf(ctx).PublicImages,
});
/** Operator scripts share the live Worker's zone-scoped purge credential. */
export class PublicImages extends WorkerEntrypoint<Env> {
  fetch(request: Request) {
    return servePublicImage(this.env, request);
  }
  async purge(tags: string[]): Promise<CachePurgeResult> {
    if (!this.env.ORIGIN.startsWith("https://")) {
      console.log(
        "Local development has no edge image cache; purge skipped:",
        JSON.stringify(tags),
      );
      return { success: true, errors: [] };
    }
    if (!this.env.IMAGE_CACHE_ZONE || !this.env.IMAGE_CACHE_TOKEN)
      return {
        success: false,
        errors: [
          { code: 0, message: "Image cache purge credentials are missing" },
        ],
      };
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${this.env.IMAGE_CACHE_ZONE}/purge_cache`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.env.IMAGE_CACHE_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ tags }),
      },
    );
    if (!response.ok)
      return {
        success: false,
        errors: [
          {
            code: response.status,
            message: "Image cache purge request failed",
          },
        ],
      };
    return response.json<CachePurgeResult>();
  }
}
export function fetchRequest(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
) {
  const closed = maintenance(env);
  if (closed) return closed;
  // Public images skip reader identification, cookies and the browsing rate limit.
  if (isPublicImageRequest(request))
    return cachedPublicImage(env, request, ctx);
  return app.fetch(request, withImages(env, ctx), ctx);
}
