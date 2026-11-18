import {
  type Env,
  type Row,
  first,
  rows,
  required,
  statement,
  fail,
  now,
  id,
  writeOnce,
} from "./common.ts";
import { award, reverse, levelFor, titleFor, badgeWrites } from "./sparks.ts";
import {
  commentSchema,
  requestKeySchema,
  shelfStateSchema,
} from "../../../packages/contracts/social.ts";
import type { ReaderPrefs } from "./prefs.ts";
import {
  canSeePost,
  postVisibilitySql,
  factVisibilitySql,
  publicFactId,
} from "./visibility.ts";
import * as C from "@fanflare/contracts";
import { boundary } from "./books.ts";
import { z } from "zod";
export async function reportFact(
  env: Env,
  user: string,
  v: z.infer<typeof C.reportFact>,
  limit?: number | null,
) {
  return socialAction(env, user, "report-fact", v, async (token) => {
    const point =
      limit === undefined ? await boundary(env, v.book_id, v.position) : limit;
    if (point === null && limit === undefined) fail("Claim unavailable", 404);
    const visible = factVisibilitySql(point);
    const candidates = await rows(
      env,
      `SELECT f.id FROM facts f JOIN sources s ON s.id=f.source LEFT JOIN characters c ON c.id=f.character LEFT JOIN contributions u ON u.id=f.contribution WHERE f.book=? AND ${visible.sql}`,
      v.book_id,
      ...visible.args,
    );
    const target = (
      await Promise.all(
        candidates.map(async (f) => ({
          id: f.id,
          publicId: await publicFactId(v.book_id, f.id),
        })),
      )
    ).find((f) => f.publicId === v.fact_id)?.id;
    if (!target) fail("Claim unavailable", 404);
    return [
      statement(
        env,
        "INSERT INTO reports(id,target_type,target,detail,created) VALUES(?,'fact',?,?,?)",
        token,
        target,
        JSON.stringify({
          reason: v.reason,
          explanation: v.explanation,
          correction: v.correction,
          source: v.source,
        }),
        now(),
      ),
      statement(
        env,
        "INSERT INTO context_report_claims(report,book,subject,subject_id,detail,claim_key) SELECT ?,f.book,COALESCE(c.name,''),f.character,f.detail,CASE WHEN instr(f.id,':fact:')>0 THEN substr(f.id,instr(f.id,':fact:')+6) END FROM facts f LEFT JOIN characters c ON c.id=f.character WHERE f.id=?",
        token,
        target,
      ),
    ];
  });
}
export async function socialAction(
  env: Env,
  user: string,
  operation: string,
  input: { request_key: string; [key: string]: unknown },
  build: (token: string) => Promise<D1PreparedStatement[]>,
  affected: string[] = [],
) {
  if (!user) fail("Sign in to continue", 401);
  requestKeySchema.parse(input.request_key);
  const snapshot = (spend = false) =>
    `(SELECT COALESCE(SUM(amount),0) FROM sparks_ledger WHERE user_id=?${spend ? "" : " AND spend=0"})`;
  const badgeSnapshot = `(SELECT json_group_array(badge) FROM badges WHERE user_id=?)`;
  const token = await writeOnce(
    env,
    user,
    "social:" + operation,
    input,
    async () => {
      const token = id("event");
      return {
        resource: token,
        writes: [
          statement(
            env,
            `INSERT INTO social_results(event,before_lifetime,before_badges) VALUES(?,${snapshot()},${badgeSnapshot})`,
            token,
            user,
            user,
          ),
          ...(await build(token)),
          ...badgeWrites(env, user),
          ...affected
            .filter((u) => u !== user)
            .flatMap((u) => badgeWrites(env, u)),
          statement(
            env,
            `UPDATE social_results SET lifetime=${snapshot()},balance=${snapshot(true)},badges=${badgeSnapshot} WHERE event=?`,
            user,
            user,
            user,
            token,
          ),
        ],
      };
    },
  ).catch((error) => {
    if (String(error).includes("Social action rate limit"))
      fail("Social action rate limit exceeded", 429);
    throw error;
  });
  const result = await required(
    env,
    "SELECT * FROM social_results WHERE event=?",
    token,
  );
  const level = levelFor(result.lifetime),
    oldBadges = JSON.parse(result.before_badges) as string[];
  return {
    event: token,
    sparks: {
      delta: result.lifetime - result.before_lifetime,
      balance: result.balance,
      lifetime: result.lifetime,
      level,
      title: titleFor(level),
      leveledUp: level > levelFor(result.before_lifetime),
      newBadges: (JSON.parse(result.badges) as string[]).filter(
        (b) => !oldBadges.includes(b),
      ),
    },
  };
}
function effect(env: Env, token: string) {
  return statement(
    env,
    "INSERT INTO social_effects SELECT ? WHERE changes()>0",
    token,
  );
}
const gate = "EXISTS(SELECT 1 FROM social_effects WHERE id=?)";
export async function toggleUpvote(
  env: Env,
  user: string,
  post: string,
  active: boolean,
  request_key: string,
  prefs: ReaderPrefs,
) {
  return toggle(env, user, post, active, request_key, prefs, "vote");
}
export async function toggleFavorite(
  env: Env,
  user: string,
  post: string,
  active: boolean,
  request_key: string,
  prefs: ReaderPrefs,
) {
  return toggle(env, user, post, active, request_key, prefs, "favorite");
}
async function toggle(
  env: Env,
  user: string,
  post: string,
  active: boolean,
  request_key: string,
  prefs: ReaderPrefs,
  kind: "vote" | "favorite",
) {
  if (!(await canSeePost(env, prefs, post))) fail("Artwork unavailable", 404);
  const p = await required(
    env,
    "SELECT owner FROM posts WHERE id=? AND removed IS NULL",
    post,
  );
  if (kind === "vote" && p.owner === user)
    fail("You cannot upvote your own artwork");
  const table = kind === "vote" ? "upvotes" : "favorites";
  const result = await socialAction(
    env,
    user,
    kind,
    { request_key, post, active } as any,
    async (token) => {
      const writes = [
        rateWrite(env, user, kind),
        active
          ? statement(
              env,
              `INSERT OR IGNORE INTO ${table}(user_id,post,created) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM posts WHERE id=? AND removed IS NULL)`,
              user,
              post,
              now(),
              post,
            )
          : statement(
              env,
              `DELETE FROM ${table} WHERE user_id=? AND post=?`,
              user,
              post,
            ),
        effect(env, token),
      ];
      if (active && p.owner !== user) {
        writes.push(award(env, user, kind, token, post, gate, [token]));
        if (kind === "vote")
          writes.push(
            award(
              env,
              p.owner,
              "receiveVote",
              token,
              post,
              gate,
              [token],
              post + ":" + user,
            ),
            statement(
              env,
              `INSERT INTO notifications(id,user_id,kind,subject,post,created) SELECT ?,?,'upvote',?,?,? WHERE ${gate} AND NOT EXISTS(SELECT 1 FROM seed_studio WHERE user_id=?) ON CONFLICT(user_id,kind,subject) DO UPDATE SET created=excluded.created,read_at=NULL`,
              id("notice"),
              p.owner,
              post + ":" + Math.floor(now() / 86400000),
              post,
              now(),
              token,
              user,
            ),
          );
      } else if (!active) {
        writes.push(
          reverse(
            env,
            `s.post=? AND ((s.user_id=? AND s.action=?) OR (s.action='receiveVote' AND s.reference=? AND ?='vote')) AND ${gate}`,
            [post, user, kind, post + ":" + user, kind, token],
          ),
        );
        if (kind === "vote")
          writes.push(
            statement(
              env,
              `DELETE FROM notifications WHERE post=? AND kind='upvote' AND NOT EXISTS(SELECT 1 FROM upvotes u WHERE u.post=notifications.post AND CAST(u.created/86400000 AS INTEGER)=CAST(substr(notifications.subject,length(notifications.post)+2) AS INTEGER))`,
              post,
            ),
          );
      }
      return writes;
    },
    [p.owner],
  );
  return {
    ...result,
    active: !!(await first(
      env,
      `SELECT 1 FROM ${table} WHERE user_id=? AND post=?`,
      user,
      post,
    )),
  };
}
export function rateWrite(env: Env, user: string, kind: string) {
  // The constraint aborts the entire batch, including its receipt, on overflow.
  return statement(
    env,
    `INSERT INTO social_rate(user_id,kind,bucket,count) VALUES(?,?,?,1)
 ON CONFLICT(user_id,kind,bucket) DO UPDATE SET count=social_rate.count+1`,
    user,
    kind,
    Math.floor(now() / 60000),
  );
}
export async function createComment(
  env: Env,
  user: string,
  post: string,
  body: string,
  request_key: string,
  prefs: ReaderPrefs,
) {
  body = commentSchema.parse(body);
  const visibility = postVisibilitySql(prefs);
  if (!(await canSeePost(env, prefs, post))) fail("Artwork unavailable", 404);
  const p = await required(
    env,
    "SELECT owner FROM posts WHERE id=? AND removed IS NULL",
    post,
  );
  const result = await socialAction(
    env,
    user,
    "comment",
    { request_key, post, body } as any,
    async (token) => {
      const writes = [
        rateWrite(env, user, "comment"),
        statement(
          env,
          `INSERT INTO comments(id,post,user_id,body,created) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM posts p WHERE p.id=? AND ${visibility.sql})`,
          token,
          post,
          user,
          body,
          now(),
          post,
          ...visibility.args,
        ),
        effect(env, token),
      ];
      if (p.owner !== user)
        writes.push(
          award(env, user, "comment", token, post, gate, [token]),
          award(
            env,
            p.owner,
            "receiveComment",
            token,
            post,
            `${gate} AND NOT EXISTS(SELECT 1 FROM sparks_ledger s WHERE s.user_id=? AND s.action='receiveComment' AND s.reference=? AND NOT EXISTS(SELECT 1 FROM sparks_ledger r WHERE r.reversal_of=s.id))`,
            [token, p.owner, post + ":" + user],
            post + ":" + user,
          ),
          statement(
            env,
            `INSERT INTO notifications(id,user_id,kind,subject,post,created) SELECT ?,?,'comment',?,?,? WHERE ${gate}`,
            id("notice"),
            p.owner,
            token,
            post,
            now(),
            token,
          ),
        );
      return writes;
    },
    [p.owner],
  );
  await required(env, "SELECT 1 FROM comments WHERE id=?", result.event);
  return { ...result, commentId: result.event };
}
export async function deleteComment(
  env: Env,
  user: string,
  comment: string,
  request_key: string,
  moderator = false,
) {
  const c = await required(env, "SELECT * FROM comments WHERE id=?", comment);
  if (c.user_id !== user && !moderator)
    fail("Comment belongs to another reader", 403);
  if (
    moderator &&
    !(await first(env, "SELECT 1 FROM moderators WHERE user_id=?", user))
  )
    fail("Moderator access required", 403);
  return socialAction(
    env,
    user,
    "delete-comment",
    { request_key, comment } as any,
    async (token) => [
      statement(
        env,
        "UPDATE comments SET removed=? WHERE id=? AND removed IS NULL",
        now(),
        comment,
      ),
      effect(env, token),
      reverse(env, `s.action='comment' AND s.subject=? AND ${gate}`, [
        comment,
        token,
      ]),
      reverse(
        env,
        `s.action='receiveComment' AND s.reference=? AND NOT EXISTS(SELECT 1 FROM comments WHERE post=? AND user_id=? AND removed IS NULL) AND ${gate}`,
        [c.post + ":" + c.user_id, c.post, c.user_id, token],
      ),
      statement(
        env,
        `DELETE FROM notifications WHERE kind='comment' AND subject=?`,
        comment,
      ),
    ],
  );
}
export async function listComments(env: Env, post: string, prefs: ReaderPrefs) {
  if (!(await canSeePost(env, prefs, post))) return [];
  const visibility = postVisibilitySql(prefs, "art");
  return (
    await rows(
      env,
      `SELECT c.id,c.body,c.created,c.user_id,p.handle,p.display_name,p.private,p.avatar FROM comments c JOIN profiles p ON p.user_id=c.user_id JOIN posts art ON art.id=c.post WHERE c.post=? AND c.removed IS NULL AND ${visibility.sql} ORDER BY c.created,c.id`,
      post,
      ...visibility.args,
    )
  ).map((r): Row => ({ ...r, avatar: JSON.parse(r.avatar) }));
}
export async function setShelf(
  env: Env,
  user: string,
  book: string,
  state: "want" | "reading" | "read" | null,
  request_key: string,
) {
  if (state !== null) shelfStateSchema.parse(state);
  await required(env, "SELECT id FROM books WHERE id=?", book);
  return socialAction(
    env,
    user,
    "shelf",
    { request_key, book, state } as any,
    async (token) =>
      state === null
        ? [
            statement(
              env,
              "DELETE FROM shelf WHERE user_id=? AND book=?",
              user,
              book,
            ),
            effect(env, token),
            reverse(
              env,
              `s.user_id=? AND s.action='shelf' AND s.reference=? AND ${gate}`,
              [user, book, token],
            ),
          ]
        : [
            statement(
              env,
              "INSERT OR IGNORE INTO shelf(user_id,book,state,created) VALUES(?,?,?,?)",
              user,
              book,
              state,
              now(),
            ),
            effect(env, token),
            award(env, user, "shelf", token, null, gate, [token], book),
            statement(
              env,
              "UPDATE shelf SET state=? WHERE user_id=? AND book=?",
              state,
              user,
              book,
            ),
          ],
  );
}
export async function listShelf(
  env: Env,
  user: string,
  prefs: ReaderPrefs,
): Promise<Row[]> {
  const visibility = postVisibilitySql(prefs);
  return rows(
    env,
    `SELECT s.*,b.title,b.authors,(SELECT count(*) FROM posts p WHERE p.book=s.book AND ${visibility.sql} AND p.approved>s.visited) new_art FROM shelf s JOIN books b ON b.id=s.book WHERE s.user_id=? ORDER BY s.created DESC`,
    ...visibility.args,
    user,
  ).then((items) =>
    items.map((item) => ({
      ...item,
      position: prefs.positions[item.book] ?? null,
    })),
  );
}
export async function visitShelfBook(env: Env, user: string, book: string) {
  await statement(
    env,
    "UPDATE shelf SET visited=? WHERE user_id=? AND book=?",
    now(),
    user,
    book,
  ).run();
}
export async function reportSocial(
  env: Env,
  user: string,
  type: "comment" | "profile",
  target: string,
  detail: string,
  request_key: string,
  prefs: ReaderPrefs,
) {
  if (!detail.trim() || detail.length > 2000)
    fail("Report detail must be 1–2,000 characters");
  if (type === "comment") {
    const c = await required(
      env,
      "SELECT post FROM comments WHERE id=? AND removed IS NULL",
      target,
    );
    if (!(await canSeePost(env, prefs, c.post)))
      fail("Artwork unavailable", 404);
  } else await required(env, "SELECT 1 FROM profiles WHERE user_id=?", target);
  return socialAction(
    env,
    user,
    "report",
    { request_key, type, target, detail } as any,
    async (token) => [
      statement(
        env,
        "INSERT INTO reports(id,target_type,target,detail,created) VALUES(?,?,?,?,?)",
        token,
        type,
        target,
        detail,
        now(),
      ),
    ],
  );
}

export type ActionResult = Awaited<ReturnType<typeof socialAction>>;
