import { publicationWrites, removalWrites } from "./sparks.ts";
import { z } from "zod";
import * as C from "@fanflare/contracts";
import { boundary, getBook } from "./books.ts";
import {
  type Env,
  type Row,
  first,
  rows,
  statement,
  required,
  mac,
  digest,
  id,
  fail,
  now,
  writeOnce,
} from "./common.ts";
import { publicSubjectId } from "./visibility.ts";
import { type PublicImage, artTag, purgeImages, storedWebp } from "./images.ts";
const day = 86400000;
export async function limited(
  stream: ReadableStream<Uint8Array> | null,
  max: number,
) {
  if (!stream) fail("File missing");
  const reader = stream.getReader(),
    parts: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > max) {
        await reader.cancel();
        fail("File exceeds its limit", 413);
      }
      parts.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return bytes;
}
function stillImage(bytes: Uint8Array, mime: string) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
  const text = (i: number, len: number) =>
    String.fromCharCode(...bytes.subarray(i, i + len));
  if (mime === "image/jpeg") return bytes[0] === 255 && bytes[1] === 216;
  if (mime === "image/png") {
    if (text(1, 3) !== "PNG") return false;
    for (let i = 8; i + 12 <= bytes.length;) {
      const type = text(i + 4, 4);
      if (type === "acTL") return false;
      if (type === "IDAT") return true;
      i += view.getUint32(i) + 12;
    }
    return false;
  }
  if (mime === "image/webp") {
    if (text(0, 4) !== "RIFF" || text(8, 4) !== "WEBP") return false;
    for (let i = 12; i + 8 <= bytes.length;) {
      if (["ANIM", "ANMF"].includes(text(i, 4))) return false;
      const len = view.getUint32(i + 4, true);
      i += 8 + len + (len % 2);
    }
    return true;
  }
  return (
    text(4, 4) === "ftyp" &&
    ["heic", "heix", "mif1"].includes(text(8, 4)) &&
    !/hevc|hevx|msf1/.test(text(8, Math.min(128, view.byteLength - 8)))
  );
}
const uploadProof = (env: Env, a: Row) =>
  mac(env.AUTH_SECRET, [a.id, a.owner, a.purpose, a.upload_until].join("|"));
async function stageImageShared(
  env: Env,
  user: string,
  v: z.infer<typeof C.stage>,
  includeUploadUrl: boolean,
) {
  const aid = await writeOnce(env, user, "stage", v, async () => {
    await getBook(env, v.book_id);
    const aid = id("asset");
    return {
      resource: aid,
      writes: [
        statement(
          env,
          "INSERT INTO assets(id,owner,book,purpose,mime,size,expires,upload_until,created) VALUES(?,?,?,?,?,?,?,?,?)",
          aid,
          user,
          v.book_id,
          v.purpose,
          v.mime,
          v.size ?? 0,
          now() + day,
          now() + 15 * 60000,
          now(),
        ),
      ],
    };
  });
  let transferIssue: string | undefined;
  let a = await required(env, "SELECT * FROM assets WHERE id=?", aid);
  if (!a.object_prefix && v.file) {
    const url = new URL(v.file.download_url);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      !(
        url.hostname === "files.oaiusercontent.com" ||
        url.hostname.endsWith(".oaiusercontent.com")
      )
    )
      transferIssue =
        "This file host is unsupported. Attach the downloaded image on the review page.";
    if (!transferIssue) {
      const response = await fetch(url, {
        redirect: "error",
        signal: AbortSignal.timeout(20000),
      }).catch(() => null);
      if (response?.ok) {
        await receive(env, a, response.body);
        a = await required(env, "SELECT * FROM assets WHERE id=?", aid);
      } else
        transferIssue =
          "The host file is unavailable. Attach the download on the review page.";
    }
  }
  const available = a.expires > now();
  return {
    asset_id: aid,
    transfer_issue: transferIssue,
    validated: available && !!a.object_prefix,
    state: !available
      ? "expired"
      : a.object_prefix
        ? "ready"
        : "pending_upload",
    upload_url:
      includeUploadUrl &&
      available &&
      !a.object_prefix &&
      a.upload_until > now()
        ? env.ORIGIN +
          "/upload/" +
          aid +
          "?proof=" +
          (await uploadProof(env, a))
        : null,
    next_action: a.object_prefix
      ? "Review the image before sharing."
      : "PUT the file bytes to the upload URL, or attach it on the review page.",
  };
}
export function stageImage(env: Env, user: string, v: z.infer<typeof C.stage>) {
  return stageImageShared(env, user, v, true);
}
// Seed callers transfer bytes through receive directly; no bearer upload URL is issued.
export function stageSeedImage(
  env: Env,
  user: string,
  v: z.infer<typeof C.stage>,
) {
  return stageImageShared(env, user, v, false);
}
export async function upload(
  env: Env,
  aid: string,
  proof: string,
  body: ReadableStream<Uint8Array> | null,
) {
  const a = await required(env, "SELECT * FROM assets WHERE id=?", aid);
  if (a.upload_until <= now() || (await uploadProof(env, a)) !== proof)
    fail("Upload link expired or invalid", 403);
  return receive(env, a, body);
}
export async function receive(
  env: Env,
  a: Row,
  stream: ReadableStream<Uint8Array> | null,
) {
  if (a.expires <= now() || a.object_prefix)
    fail("Asset already received or expired", 409);
  const bytes = await limited(
    stream,
    Math.min(C.MAX_BYTES, a.size || C.MAX_BYTES),
  );
  if (
    !bytes.length ||
    (a.size && bytes.length !== a.size) ||
    !stillImage(bytes, a.mime)
  )
    fail("Supply a still image matching the staged type and size", 415);
  const blob = new Blob([bytes]);
  const info = await env.IMAGES.info(blob.stream()).catch((e: ImagesError) => {
    console.warn("Image decoder rejected input", a.mime, e.code);
    if ([9424, 9516, 9517, 9518].includes(e.code))
      fail(
        "Cloudflare could not process this image. Keep the original and retry, or stage a JPEG, PNG, or WebP export.",
        503,
      );
    return fail("Image could not be decoded", 415);
  });
  const sameFormat =
    info.format === a.mime ||
    (["image/heic", "image/heif"].includes(a.mime) &&
      ["image/heic", "image/heif"].includes(info.format));
  if (!sameFormat)
    fail("Decoded type differs from the declared file type", 415);
  if (
    !("width" in info) ||
    !info.width ||
    !info.height ||
    info.width * info.height > 24000000
  )
    fail("Image exceeds the decoded dimension limit", 415);
  const prefix = a.id + "/" + crypto.randomUUID();
  let dimensions: { width: number; height: number } | undefined;
  try {
    for (const [suffix, width] of [
      ["display", 1800],
      ["thumb", 500],
    ] as const) {
      const output = await env.IMAGES.input(blob.stream())
        .transform({
          width: Math.min(info.width, width),
          height: Math.min(info.height, width),
          fit: "scale-down",
        })
        .output({ format: "image/webp", quality: 85, anim: false });
      const normalized = await output.response().arrayBuffer();
      if (suffix === "display") {
        const measured = await env.IMAGES.info(new Blob([normalized]).stream());
        if (!("width" in measured) || !measured.width || !measured.height)
          fail("Normalized dimensions unavailable", 415);
        dimensions = { width: measured.width, height: measured.height };
      }
      await env.MEDIA.put(prefix + "/" + suffix, normalized, {
        httpMetadata: { contentType: "image/webp" },
      });
    }
    const [result] = await env.DB.batch([
      statement(
        env,
        "UPDATE assets SET object_prefix=?,digest=?,size=?,width=?,height=? WHERE id=? AND object_prefix IS NULL AND expires>?",
        prefix,
        await digest(bytes.buffer),
        bytes.length,
        dimensions!.width,
        dimensions!.height,
        a.id,
        now(),
      ),
      statement(
        env,
        "UPDATE drafts SET revision=revision+1,challenge=? WHERE asset=? AND state='draft' AND EXISTS(SELECT 1 FROM assets WHERE id=? AND object_prefix=?)",
        id("approval"),
        a.id,
        a.id,
        prefix,
      ),
    ]);
    if (!result.meta.changes) fail("Asset changed during upload", 409);
  } catch (e) {
    await env.MEDIA.delete([prefix + "/display", prefix + "/thumb"]);
    throw e;
  }
  return { asset_id: a.id, validated: true };
}
export async function validatedMeta(
  env: Env,
  book: string,
  m: z.infer<typeof C.metadata>,
) {
  const b = await boundary(env, book, m.position);
  if (b === null && m.position.kind !== "unknown")
    fail("Reading position is unverified. Choose a known chapter or unknown.");
  if (m.character_ids.length) {
    const subjects = await rows(
      env,
      "SELECT id FROM characters WHERE book=? AND (? IS NULL OR reveal<=?)",
      book,
      b,
      b,
    );
    const resolved = await Promise.all(
      subjects.map(async (s) => ({
        id: s.id,
        publicId: await publicSubjectId(book, s.id),
      })),
    );
    m.character_ids = m.character_ids.map(
      (character) =>
        resolved.find((s) => s.id === character || s.publicId === character)
          ?.id ??
        fail("Character does not match the book and reading position."),
    );
  }
  return b;
}
export const ownDraft = (env: Env, user: string, did: string) =>
  required(
    env,
    "SELECT d.*,a.object_prefix,a.mime,a.size,b.title FROM drafts d JOIN assets a ON a.id=d.asset JOIN books b ON b.id=d.book WHERE d.id=? AND d.owner=?",
    did,
    user,
  );
export async function draftResult(env: Env, user: string, did: string) {
  const d = await ownDraft(env, user, did);
  const state = d.state === "draft" && d.expires <= now() ? "expired" : d.state;
  return {
    draft_id: did,
    state,
    revision: d.revision,
    validated: !!d.object_prefix,
    review_url: env.ORIGIN + "/review/" + did,
    permalink: state === "published" ? env.ORIGIN + "/posts/" + did : null,
    next_action:
      state === "draft"
        ? "Open the private review page to approve this exact revision."
        : "View the current draft state.",
  };
}
export async function draft(
  env: Env,
  user: string,
  v: z.infer<typeof C.publish>,
) {
  const did = await writeOnce(env, user, "publish", v, async () => {
    const a = await required(
      env,
      "SELECT * FROM assets WHERE id=? AND owner=? AND book=? AND purpose='artwork' AND expires>?",
      v.asset_id,
      user,
      v.book_id,
      now(),
    );
    if (await first(env, "SELECT id FROM drafts WHERE asset=?", a.id))
      fail("This asset already has a draft", 409);
    const did = id("post"),
      metadata = C.metadata.parse(v),
      b = await validatedMeta(env, v.book_id, metadata);
    return {
      resource: did,
      writes: [
        statement(
          env,
          "INSERT INTO drafts(id,owner,book,asset,metadata,boundary,challenge,expires) VALUES(?,?,?,?,?,?,?,?)",
          did,
          user,
          v.book_id,
          a.id,
          JSON.stringify(metadata),
          b,
          id("approval"),
          a.expires,
        ),
      ],
    };
  });
  return draftResult(env, user, did);
}
export async function editDraft(
  env: Env,
  user: string,
  did: string,
  revision: number,
  m: z.infer<typeof C.metadata>,
) {
  const d = await ownDraft(env, user, did),
    b = await validatedMeta(env, d.book, m);
  const result = await statement(
    env,
    "UPDATE drafts SET metadata=?,boundary=?,revision=revision+1,challenge=? WHERE id=? AND owner=? AND revision=? AND state='draft' AND expires>?",
    JSON.stringify(m),
    b,
    id("approval"),
    did,
    user,
    revision,
    now(),
  ).run();
  if (!result.meta.changes)
    fail("The review changed or expired. Reload it.", 409);
}
export async function decide(
  env: Env,
  user: string,
  did: string,
  challenge: string,
  accept: boolean,
) {
  const d = await ownDraft(env, user, did);
  if (d.state !== "draft" || d.expires <= now() || d.challenge !== challenge)
    fail("This approval is stale or has been used", 409);
  if (accept && !d.object_prefix) fail("Attach the image first");
  const state = accept ? "published" : "declined",
    consent = now(),
    nonce = id("used");
  const writes = [
    statement(
      env,
      "UPDATE drafts SET state=?,challenge=?,metadata=CASE WHEN ?=1 THEN metadata ELSE '{}' END WHERE id=? AND owner=? AND challenge=? AND state='draft' AND expires>?",
      state,
      nonce,
      +accept,
      did,
      user,
      challenge,
      consent,
    ),
  ];
  if (accept)
    writes.push(
      statement(
        env,
        "INSERT INTO posts SELECT id,book,owner,asset,metadata,boundary,?,NULL FROM drafts WHERE id=? AND challenge=?",
        consent,
        did,
        nonce,
      ),
    );
  writes.push(
    statement(
      env,
      "UPDATE assets SET expires=? WHERE id IN (SELECT asset FROM drafts WHERE id=? AND challenge=?)",
      accept ? Number.MAX_SAFE_INTEGER : 0,
      did,
      nonce,
    ),
  );
  if (accept) writes.push(...publicationWrites(env, user, did));
  const [r] = await env.DB.batch(writes);
  if (!r.meta.changes) fail("Approval has been used", 409);
  return draftResult(env, user, did);
}
export async function removePost(
  env: Env,
  user: string,
  post: string,
  mod = false,
) {
  const p = await required(
    env,
    "SELECT asset FROM posts WHERE id=? AND removed IS NULL AND (owner=? OR ?=1)",
    post,
    user,
    +mod,
  );
  await env.DB.batch([
    statement(env, "UPDATE posts SET removed=? WHERE id=?", now(), post),
    statement(env, "UPDATE drafts SET state='removed' WHERE id=?", post),
    statement(env, "UPDATE assets SET expires=0 WHERE id=?", p.asset),
    ...removalWrites(env, post),
  ]);
  await purgeImages(env, [artTag(p.asset)]);
}
/** D1's rule for public artwork: published and unremoved, or an approved public reference image. */
export const publicAssetSql = `a.expires>? AND a.object_prefix IS NOT NULL AND (EXISTS(SELECT 1 FROM posts p WHERE p.asset=a.id AND p.removed IS NULL AND p.approved IS NOT NULL) OR EXISTS(SELECT 1 FROM contributions u WHERE u.asset=a.id AND u.image_approved=1 AND u.original_sketch=1 AND u.display=1 AND u.state='accepted'))`;
/** A public artwork rendition at its public URL. Spoiler preferences decide listing, not access. */
export async function publicArt(
  env: Env,
  asset: string,
  file: string,
): Promise<PublicImage | null> {
  const rendition = (
    { "display.webp": "display", "thumb.webp": "thumb" } as const
  )[file];
  if (!rendition) return null;
  const a = await first(
    env,
    `SELECT a.object_prefix FROM assets a WHERE a.id=? AND ${publicAssetSql}`,
    asset,
    now(),
  );
  if (!a) return null;
  return {
    tag: artTag(asset),
    etag: `"${asset}-${rendition}"`,
    body: () => storedWebp(env, a.object_prefix + "/" + rendition),
  };
}
/**
 * Private media: an owner's unpublished upload and moderator evidence. Public
 * artwork is served only at its public URL.
 */
export async function media(
  env: Env,
  asset: string,
  thumb: boolean,
  user?: string,
  mod = false,
) {
  const a = await required(
    env,
    `SELECT a.object_prefix FROM assets a WHERE a.id=? AND a.expires>? AND a.object_prefix IS NOT NULL AND
 ((a.owner=? AND NOT EXISTS(SELECT 1 FROM posts WHERE asset=a.id)) OR (?=1 AND a.purpose='evidence'))`,
    asset,
    now(),
    user ?? null,
    +mod,
  );
  const obj = await env.MEDIA.get(
    a.object_prefix + (thumb ? "/thumb" : "/display"),
  );
  if (!obj) fail("Media unavailable", 404);
  return new Response(obj.body, {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
export async function cleanup(env: Env) {
  // Resume bucket traversal across cron runs, including objects written before an interrupted D1 commit.
  const checkpoint = await first(
    env,
    "SELECT cursor FROM cleanup_cursor WHERE id=1",
  );
  const objects = await env.MEDIA.list({
    prefix: "asset_",
    limit: 200,
    cursor: checkpoint?.cursor ?? undefined,
  });
  const old = objects.objects.filter((o) => o.uploaded.getTime() < now() - day);
  for (const object of old) {
    const prefix = object.key.slice(0, object.key.lastIndexOf("/"));
    if (
      !(await first(
        env,
        "SELECT 1 FROM assets WHERE id=? AND object_prefix=?",
        object.key.split("/")[0],
        prefix,
      ))
    )
      await env.MEDIA.delete(object.key);
  }
  await statement(
    env,
    "INSERT INTO cleanup_cursor VALUES(1,?) ON CONFLICT(id) DO UPDATE SET cursor=excluded.cursor",
    objects.truncated ? objects.cursor : null,
  ).run();
  await statement(
    env,
    "UPDATE drafts SET state='expired',metadata='{}' WHERE state='draft' AND expires<=?",
    now(),
  ).run();
  for (const a of await rows(
    env,
    "SELECT id,object_prefix FROM assets WHERE expires<=? AND object_prefix IS NOT NULL LIMIT 300",
    now(),
  )) {
    await env.MEDIA.delete([
      a.object_prefix + "/display",
      a.object_prefix + "/thumb",
    ]);
    await statement(
      env,
      "UPDATE assets SET object_prefix=NULL WHERE id=? AND object_prefix=?",
      a.id,
      a.object_prefix,
    ).run();
  }
}
