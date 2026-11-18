import { type Env, fail } from "./common.ts";
import { renderAvatar } from "./avatar-art/render.ts";
import type { Avatar } from "../../../packages/contracts/social.ts";

// Public images: published artwork, approved reference images, covers and public
// avatars. Every URL names its image and rendition, and a changed image gets a
// new URL. D1 decides on every cache miss whether the URL is still public. See
// docs/image-delivery/SPEC.md.
//
//   /img/art/<asset>/<display|thumb>.webp     an asset's renditions are written once
//   /img/cover/<book>/<version>/<320|640>.webp
//   /img/cover/<book>/<hash>/placeholder.svg  hash of the rendered placeholder
//   /img/avatar/<handle>/<hash>.svg           hash of the rendered avatar

export const PUBLIC_IMAGE_PREFIX = "/img/";
export const publicImageHeaders = {
  "Cache-Control": "public, max-age=3600, must-revalidate",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
};

/** A short, stable content version. It names a rendition; it never grants access. */
export function contentVersion(text: string) {
  let a = 0x811c9dc5,
    b = 0x9e3779b9;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c, 0x5bd1e995);
  }
  return (
    (a >>> 0).toString(16).padStart(8, "0") +
    (b >>> 0).toString(16).padStart(8, "0")
  );
}

const segment = encodeURIComponent;
export type ArtRendition = "display" | "thumb";
export const artUrl = (asset: string, rendition: ArtRendition) =>
  `/img/art/${segment(asset)}/${rendition}.webp`;
export const coverPath = (book: string, version: number, width: 320 | 640) =>
  `/img/cover/${segment(book)}/${version}/${width}.webp`;
export const placeholderPath = (book: string, svg: string) =>
  `/img/cover/${segment(book)}/${contentVersion(svg)}/placeholder.svg`;

export type AvatarProfile = {
  handle: string;
  avatar: Avatar;
  private: boolean;
};
/** A public profile's avatar URL. A private profile's avatar is inlined, so no URL serves it. */
export function avatarSrc(p: AvatarProfile) {
  const svg = renderAvatar(p.avatar, p.handle);
  return p.private
    ? "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg)
    : `/img/avatar/${segment(p.handle)}/${contentVersion(svg)}.svg`;
}

// One tag per image covers all of its renditions and versions.
export const artTag = (asset: string) => "img-art-" + asset;
export const coverTag = (book: string) => "img-cover-" + book;
export const avatarTag = (user: string) => "img-avatar-" + user;

/** A public image D1 has confirmed. The body is read only when it must be sent. */
export type PublicImage = {
  /** Cache tag covering every rendition and version of the image. */
  tag: string;
  etag: string;
  body: () => Promise<{ body: ReadableStream | string; type: string }>;
};
export async function storedWebp(env: Env, key: string) {
  const object = await env.MEDIA.get(key);
  if (!object) {
    console.error("Public image object missing", key);
    fail("Image unavailable", 503);
  }
  return { body: object.body, type: "image/webp" };
}

/** The public image entrypoint, as other code reaches it. */
export interface PublicImagesService {
  purge(tags: string[]): Promise<CachePurgeResult>;
}

/**
 * Purges cached copies after the D1 change that withdrew or replaced them has
 * committed. A failure is logged and thrown, so the operator sees it; the D1
 * change stands, and the one-hour lifetime bounds any copy left behind.
 */
export async function purgeImages(env: Env, tags: string[]) {
  const errors: CachePurgeError[] = [];
  // A purge request takes at most 30 tags.
  for (let i = 0; i < tags.length; i += 30) {
    const result = await env.PUBLIC_IMAGES.purge(tags.slice(i, i + 30)).catch(
      (e: unknown): CachePurgeResult => ({
        success: false,
        errors: [{ code: 0, message: String(e) }],
      }),
    );
    if (!result.success)
      errors.push(
        ...(result.errors.length
          ? result.errors
          : [{ code: 0, message: "Purge unsuccessful" }]),
      );
  }
  if (!errors.length) return;
  console.error("Image cache purge failed", JSON.stringify({ tags, errors }));
  fail(
    "The change was saved, but clearing cached copies of the image failed. They expire within an hour.",
    503,
  );
}
