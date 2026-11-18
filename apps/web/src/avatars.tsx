import { Hono } from "hono";
import type { App } from "./view.tsx";
import { catalogItem } from "./store.ts";
import { type Env, first, fail } from "./common.ts";
import { avatarSchema } from "../../../packages/contracts/social.ts";
import { renderAvatar } from "./avatar-art/render.ts";
import { type PublicImage, avatarTag, contentVersion } from "./images.ts";
export { renderAvatar } from "./avatar-art/render.ts";
export const avatarRoutes = new Hono<App>();
/** A public profile's current avatar at its public URL. A private profile's avatar has none. */
export async function publicAvatar(
  env: Env,
  handle: string,
  file: string,
): Promise<PublicImage | null> {
  const p = await first(
    env,
    "SELECT user_id,handle,private,avatar FROM profiles WHERE handle=?",
    handle,
  );
  if (!p || p.private) return null;
  const svg = renderAvatar(JSON.parse(p.avatar), p.handle),
    version = contentVersion(svg);
  if (file !== version + ".svg") return null;
  return {
    tag: avatarTag(p.user_id),
    etag: `"${version}"`,
    body: async () => ({ body: svg, type: "image/svg+xml; charset=utf-8" }),
  };
}
// Read-only, catalog-validated preview; never writes or exposes an account configuration.
avatarRoutes.get("/api/avatar-preview", (c) => {
  let input;
  try {
    input = JSON.parse(c.req.query("avatar") ?? "{}");
  } catch {
    fail("Invalid avatar JSON");
  }
  const avatar = avatarSchema.parse(input);
  for (const [slot, id] of Object.entries(avatar)) {
    if (catalogItem(id!).slot !== slot)
      fail("Item does not fit this avatar slot");
  }
  c.header("Cache-Control", "no-store");
  return c.body(renderAvatar(avatar, "preview"), 200, {
    "Content-Type": "image/svg+xml",
  });
});
