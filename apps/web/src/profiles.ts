import {
  type Env,
  type Row,
  first,
  required,
  rows,
  statement,
  fail,
  now,
} from "./common.ts";
import {
  profileSchema,
  handleSchema,
} from "../../../packages/contracts/social.ts";
import { socialAction } from "./social.ts";
import type { Avatar } from "../../../packages/contracts/social.ts";
import { avatarTag, purgeImages } from "./images.ts";
import {
  reverse,
  LEVEL_FACTOR,
  sparksSummary,
  levelFor,
  titleFor,
} from "./sparks.ts";
const reserved = new Set([
  "admin",
  "administrator",
  "fanflare",
  "fanflare-studio",
  "moderator",
  "support",
  "studio",
  "api",
  "auth",
  "account",
  "root",
  "system",
  "help",
  "official",
  "staff",
  "null",
  "undefined",
  "me",
  "notifications",
]);
const blocked = /(?:fuck|shit|nigger|nazi|faggot)/i;
/** Reader handle changes allowed in any rolling window; D1's `handle_change_limit` trigger enforces the same numbers. */
export const HANDLE_CHANGE_LIMIT = 3;
export const HANDLE_CHANGE_WINDOW = 30 * 86400000;
export function validatePublicName(name: string) {
  if (blocked.test(name)) fail("Public name is not allowed");
  return name;
}
export function validateHandle(handle: string) {
  handleSchema.parse(handle);
  validatePublicName(handle);
  if (reserved.has(handle)) fail("Handle is reserved");
  return handle;
}
/** Remaining reader handle changes and, when any change is inside the window, when the oldest frees up. */
export async function handleAllowance(env: Env, user: string, at = now()) {
  const recent = await rows(
    env,
    "SELECT changed FROM handle_changes WHERE user_id=? AND moderator IS NULL AND changed>? ORDER BY changed",
    user,
    at - HANDLE_CHANGE_WINDOW,
  );
  return {
    remaining: Math.max(0, HANDLE_CHANGE_LIMIT - recent.length),
    nextFree: recent.length
      ? Number(recent[0].changed) + HANDLE_CHANGE_WINDOW
      : null,
  };
}
export type OwnProfile = {
  handle: string;
  pseudonym: string;
  realName: string | null;
  /** The auth name, offered as a starting value for the reader's own name. */
  authName: string;
  shown: "pseudonym" | "real";
  private: boolean;
  avatar: Avatar;
  displayName: string;
  studio: boolean;
  welcomed: boolean;
  allowance: { remaining: number; nextFree: number | null };
};
/** The signed-in reader's own identity settings; never rendered for anyone else. */
export async function ownProfile(env: Env, user: string): Promise<OwnProfile> {
  const p = await required(
    env,
    "SELECT p.handle,p.pseudonym,p.real_name,p.shown,p.private,p.avatar,p.display_name,p.studio,p.welcomed,u.name auth_name FROM profiles p JOIN user u ON u.id=p.user_id WHERE p.user_id=?",
    user,
  );
  return {
    handle: p.handle,
    pseudonym: p.pseudonym,
    realName: p.real_name,
    authName: String(p.auth_name ?? "").trim(),
    shown: p.shown,
    private: !!p.private,
    avatar: JSON.parse(p.avatar),
    displayName: p.display_name,
    studio: !!p.studio,
    welcomed: p.welcomed !== null,
    allowance: await handleAllowance(env, user),
  };
}
const dateText = (ms: number) =>
  new Date(ms).toLocaleDateString("en", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
/** Saves handle, shown name and visibility together; a refused handle change saves nothing. */
export async function saveProfile(
  env: Env,
  user: string,
  input: {
    handle: string;
    shown: "pseudonym" | "real";
    realName: string;
    private: boolean;
    request_key: string;
  },
) {
  const profile = profileSchema.parse(input);
  validateHandle(profile.handle);
  if (profile.realName) validatePublicName(profile.realName);
  if (profile.shown === "real" && !profile.realName)
    fail("Add your name to show it on your profile");
  const current = await required(
    env,
    "SELECT handle,private,studio FROM profiles WHERE user_id=?",
    user,
  );
  if (current.studio) fail("Studio profile is managed by Fanflare", 403);
  const result = await socialAction(
    env,
    user,
    "profile",
    { ...profile, request_key: input.request_key },
    async (token) => [
      // Inserts only for a real change; D1 triggers enforce the limit, retire the old handle and apply the new one.
      statement(
        env,
        "INSERT INTO handle_changes(id,user_id,old_handle,new_handle,changed) SELECT ?,user_id,handle,?,? FROM profiles WHERE user_id=? AND handle<>?",
        token,
        profile.handle,
        now(),
        user,
        profile.handle,
      ),
      statement(
        env,
        "UPDATE profiles SET real_name=?,shown=?,private=?,display_name=CASE ? WHEN 'real' THEN ? ELSE pseudonym END,welcomed=COALESCE(welcomed,?) WHERE user_id=? AND studio=0",
        profile.realName || null,
        profile.shown,
        +profile.private,
        profile.shown,
        profile.realName,
        now(),
        user,
      ),
    ],
  ).catch(async (error) => {
    const message = String(error);
    if (message.includes("Handle change limit reached")) {
      const { nextFree } = await handleAllowance(env, user);
      fail(
        `You can change your handle ${HANDLE_CHANGE_LIMIT} times in 30 days. Your next change frees up on ${dateText(nextFree!)}.`,
        429,
      );
    }
    if (
      message.includes("Handle is already taken") ||
      message.includes("UNIQUE constraint failed: profiles.handle") ||
      message.includes("This resource has already been claimed")
    )
      fail("Handle is already taken", 409);
    throw error;
  });
  const saved = await ownProfile(env, user);
  // A new handle or privacy setting withdraws the avatar's previous public URL.
  if (saved.handle !== current.handle || saved.private !== !!current.private)
    await purgeImages(env, [avatarTag(user)]);
  return { ...result, profile: saved };
}
/** Leaving the first-run page without changes. */
export async function finishWelcome(env: Env, user: string) {
  await statement(
    env,
    "UPDATE profiles SET welcomed=COALESCE(welcomed,?) WHERE user_id=?",
    now(),
    user,
  ).run();
}
export async function publicProfile(
  env: Env,
  handle: string,
): Promise<
  Row & {
    handle: string;
    display_name: string;
    private: boolean;
    avatar: Avatar;
  }
> {
  const p = await required(
    env,
    `SELECT user_id,handle,display_name,avatar,studio,private,created FROM profiles WHERE handle=?`,
    handle,
  );
  return {
    ...p,
    handle: String(p.handle),
    display_name: String(p.display_name),
    private: !!p.private,
    avatar: JSON.parse(p.avatar),
    sparks: p.studio ? null : await sparksSummary(env, p.user_id),
    badges: p.studio
      ? []
      : await rows(
          env,
          "SELECT badge,created FROM badges WHERE user_id=? ORDER BY created",
          p.user_id,
        ),
  };
}
export async function headerSummary(
  env: Env,
  user: string,
): Promise<HeaderSummary | null> {
  return first(
    env,
    `SELECT p.handle,p.display_name displayName,p.avatar,p.private,p.studio,
 COALESCE(s.balance,0) balance,COALESCE(s.lifetime,0) lifetime,
 (SELECT count(*) FROM notifications WHERE user_id=? AND read_at IS NULL) unreadCount
 FROM user u LEFT JOIN profiles p ON p.user_id=u.id LEFT JOIN
 (SELECT user_id,SUM(amount) balance,SUM(CASE WHEN spend=0 THEN amount ELSE 0 END) lifetime FROM sparks_ledger WHERE user_id=? GROUP BY user_id) s ON s.user_id=u.id WHERE u.id=?`,
    user,
    user,
    user,
  ).then((r) => {
    if (!r) return null;
    const level = r.studio ? null : levelFor(r.lifetime);
    return {
      handle: r.handle ?? null,
      displayName: r.displayName ?? null,
      avatar: JSON.parse(r.avatar ?? "{}"),
      private: !!r.private,
      studio: !!r.studio,
      balance: Number(r.balance),
      lifetime: Number(r.lifetime),
      unreadCount: Number(r.unreadCount),
      level,
      title: level === null ? null : titleFor(level),
    };
  });
}
/** Moderation: back to the generated pseudonym and its handle, with the starter avatar. */
export async function removeProfileName(
  env: Env,
  moderator: string,
  user: string,
  request_key: string,
) {
  await required(env, "SELECT 1 FROM moderators WHERE user_id=?", moderator);
  await required(
    env,
    "SELECT user_id FROM profiles WHERE user_id=? AND studio=0",
    user,
  );
  const result = await socialAction(
    env,
    moderator,
    "remove-profile",
    { request_key, user } as any,
    async (token) => [
      statement(
        env,
        "INSERT INTO handle_changes(id,user_id,old_handle,new_handle,changed,moderator) SELECT ?,p.user_id,p.handle,d.handle,?,? FROM profiles p JOIN default_handles d ON d.user_id=p.user_id WHERE p.user_id=? AND p.studio=0 AND p.handle<>d.handle",
        token,
        now(),
        moderator,
        user,
      ),
      statement(
        env,
        "UPDATE profiles SET real_name=NULL,shown='pseudonym',display_name=pseudonym,avatar='{}' WHERE user_id=? AND studio=0",
        user,
      ),
      reverse(env, "s.user_id=? AND s.action='profile'", [user]),
      statement(
        env,
        `DELETE FROM notifications WHERE user_id=? AND kind='level' AND ${LEVEL_FACTOR}*CAST(subject AS INTEGER)*(CAST(subject AS INTEGER)-1) > (SELECT COALESCE(SUM(amount),0) FROM sparks_ledger WHERE user_id=? AND spend=0)`,
        user,
        user,
      ),
    ],
  );
  await purgeImages(env, [avatarTag(user)]);
  return result;
}

export interface HeaderSummary {
  handle: string | null;
  displayName: string | null;
  avatar: Record<string, string>;
  private: boolean;
  studio: boolean;
  balance: number;
  lifetime: number;
  level: number | null;
  title: string | null;
  unreadCount: number;
}
