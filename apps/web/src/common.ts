import { HTTPException } from "hono/http-exception";
import type { PublicImagesService } from "./images.ts";
export interface Env {
  REQUEST_LIMIT: RateLimit;
  AUTH_LIMIT: RateLimit;
  WRITE_LIMIT: RateLimit;
  IMAGE_LIMIT: RateLimit;
  /** Operator RPC for global image cache purges. */
  PUBLIC_IMAGES: PublicImagesService;
  IMAGE_CACHE_ZONE?: string;
  IMAGE_CACHE_TOKEN?: string;
  DB: D1Database;
  MEDIA: R2Bucket;
  IMAGES: ImagesBinding;
  MAIL?: SendEmail;
  STATIC: Fetcher;
  ORIGIN: string;
  MAINTENANCE?: string;
  AUTH_SECRET: string;
  RUNNER_SECRET: string;
  MAIL_FROM?: string;
  IMAGE_SEARCH?: AiSearchNamespace;
}
export function fail(
  message: string,
  status: 400 | 401 | 403 | 404 | 409 | 410 | 413 | 415 | 429 | 503 = 400,
): never {
  throw new HTTPException(status, { message });
}
export type Row = Record<string, any>;
export const id = (prefix: string) => prefix + "_" + crypto.randomUUID();
export const now = () => Date.now();
export const statement = (env: Env, sql: string, ...values: unknown[]) =>
  env.DB.prepare(sql).bind(...values);
export const first = (env: Env, sql: string, ...args: unknown[]) =>
  statement(env, sql, ...args).first<Row>();
export const rows = async (env: Env, sql: string, ...args: unknown[]) =>
  (await statement(env, sql, ...args).all<Row>()).results;
export const required = async (env: Env, sql: string, ...args: unknown[]) =>
  (await first(env, sql, ...args)) ?? fail("Record unavailable", 404);
export function hex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), (x) =>
    x.toString(16).padStart(2, "0"),
  ).join("");
}
export async function digest(value: string | ArrayBuffer) {
  return hex(
    await crypto.subtle.digest(
      "SHA-256",
      typeof value === "string" ? new TextEncoder().encode(value) : value,
    ),
  );
}
export async function mac(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)),
  );
}
// The receipt and domain writes share a transaction. A competing writer either wins or replays the winning resource.
export async function writeOnce(
  env: Env,
  user: string,
  op: string,
  input: { request_key: string },
  build: () => Promise<{ resource: string; writes: D1PreparedStatement[] }>,
) {
  const hash = await digest(JSON.stringify(input));
  const replay = async () => {
    const r = await first(
      env,
      "SELECT resource,hash FROM receipts WHERE owner=? AND operation=? AND key=?",
      user,
      op,
      input.request_key,
    );
    if (r && r.hash !== hash)
      fail("Request key already used with different inputs", 409);
    return r?.resource as string | undefined;
  };
  const previous = await replay();
  if (previous) return previous;
  try {
    const { resource, writes } = await build();
    await env.DB.batch([
      statement(
        env,
        "INSERT INTO receipts VALUES(?,?,?,?,?)",
        user,
        op,
        input.request_key,
        hash,
        resource,
      ),
      ...writes,
    ]);
    return resource;
  } catch (err) {
    const winner = await replay();
    if (winner) return winner;
    if (String(err).includes("UNIQUE constraint failed"))
      fail("This resource has already been claimed", 409);
    throw err;
  }
}
