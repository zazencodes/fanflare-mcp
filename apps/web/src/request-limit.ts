import type { Env } from "./common.ts";

// Cloudflare supplies this header. Do not trust forwarded client-controlled headers.
export async function requestLimit(request: Request, env: Env) {
  const ip = request.headers.get("CF-Connecting-IP");
  if (!ip) {
    if (env.ORIGIN.startsWith("https://"))
      return new Response("Client IP unavailable", { status: 403 });
    return;
  }
  const path = new URL(request.url).pathname;
  const authRequest = [
    "/api/auth/",
    "/sign-in/",
    "/password/",
    "/account/security/",
  ].some((prefix) => path.startsWith(prefix));
  const mutation = !["GET", "HEAD", "OPTIONS"].includes(request.method);
  const limiters = [env.REQUEST_LIMIT];
  if (authRequest) limiters.push(env.AUTH_LIMIT);
  else if (mutation) limiters.push(env.WRITE_LIMIT);
  for (const limiter of limiters) {
    if (!(await limiter.limit({ key: ip })).success)
      return new Response("Too many requests. Try again in a minute.", {
        status: 429,
        headers: { "Retry-After": "60", "Cache-Control": "no-store" },
      });
  }
}

/**
 * Public image cache misses, per IP. Cache hits skip this limiter, so this
 * counts only requests that cost a D1 check and an R2 read. It is sized for an
 * image-heavy first visit from an IP many readers share.
 */
export async function imageMissLimit(request: Request, env: Env) {
  const ip = request.headers.get("CF-Connecting-IP");
  if (!ip) {
    if (env.ORIGIN.startsWith("https://"))
      return new Response("Client IP unavailable", {
        status: 403,
        headers: { "Cache-Control": "no-store" },
      });
    return;
  }
  if (!(await env.IMAGE_LIMIT.limit({ key: ip })).success)
    return new Response("Too many requests. Try again in a minute.", {
      status: 429,
      headers: { "Retry-After": "60", "Cache-Control": "no-store" },
    });
}
