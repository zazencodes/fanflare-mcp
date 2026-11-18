import { type Env, type Row, rows, first, statement, now } from "./common.ts";
import type { ReaderPrefs } from "./prefs.ts";
import { postVisibilitySql } from "./visibility.ts";
import { socialAction } from "./social.ts";
export async function listNotifications(env: Env, user: string, limit = 50) {
  return rows(
    env,
    "SELECT id,kind,subject,post,created,read_at FROM notifications WHERE user_id=? ORDER BY created DESC,id LIMIT ?",
    user,
    Math.max(1, Math.min(limit, 100)),
  );
}
/** Resolve the loaded notification snapshot in one authoritative artwork read. */
export async function notificationArtwork(
  env: Env,
  user: string,
  prefs: ReaderPrefs,
  notices: Row[],
) {
  const visibility = postVisibilitySql(prefs);
  const details = await rows(
    env,
    `SELECT n.id,b.title,
    CASE WHEN n.kind='upvote' THEN (SELECT count(*) FROM upvotes u WHERE u.post=p.id AND CAST(u.created/86400000 AS INTEGER)=CAST(substr(n.subject,length(n.post)+2) AS INTEGER)) ELSE 0 END vote_count
    FROM notifications n JOIN posts p ON p.id=n.post JOIN books b ON b.id=p.book
    WHERE n.user_id=? AND n.id IN (SELECT value FROM json_each(?)) AND ${visibility.sql}`,
    user,
    JSON.stringify(notices.filter((n) => n.post).map((n) => n.id)),
    ...visibility.args,
  );
  return new Map(details.map((detail) => [detail.id, detail]));
}
export async function unreadCount(env: Env, user: string) {
  return Number(
    (await first(
      env,
      "SELECT count(*) n FROM notifications WHERE user_id=? AND read_at IS NULL",
      user,
    ))!.n,
  );
}
export async function markNotificationsRead(
  env: Env,
  user: string,
  ids: string[] | null,
  request_key: string,
) {
  return socialAction(
    env,
    user,
    "read-notifications",
    { request_key, ids } as any,
    async () => [
      ids === null
        ? statement(
            env,
            "UPDATE notifications SET read_at=? WHERE user_id=? AND read_at IS NULL",
            now(),
            user,
          )
        : statement(
            env,
            `UPDATE notifications SET read_at=? WHERE user_id=? AND id IN (SELECT value FROM json_each(?)) AND read_at IS NULL`,
            now(),
            user,
            JSON.stringify(ids),
          ),
    ],
  );
}
