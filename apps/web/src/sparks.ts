import { type Env, first, rows, statement, now, id } from "./common.ts";
export const SPARKS = {
  publish: 50,
  firstBook: 25,
  receiveVote: 10,
  receiveComment: 5,
  vote: 2,
  comment: 5,
  favorite: 1,
  shelf: 2,
  profile: 25,
} as const;
export const CAPS: Partial<Record<keyof typeof SPARKS, number>> = {
  vote: 25,
  comment: 10,
  favorite: 20,
  shelf: 10,
};
export const TITLES = [
  [25, "Mythmaker"],
  [20, "Archivist"],
  [16, "Loremaster"],
  [12, "Storyteller"],
  [8, "Illustrator"],
  [5, "Page Turner"],
  [3, "Bookworm"],
  [1, "Reader"],
] as const;
export const LEVEL_FACTOR = 25;
export const sparksForLevel = (level: number) =>
  LEVEL_FACTOR * level * (level - 1);
export function levelFor(lifetime: number) {
  return Math.max(
    1,
    Math.floor(
      (1 + Math.sqrt(1 + (Math.max(0, lifetime) * 4) / LEVEL_FACTOR)) / 2,
    ),
  );
}
export function titleFor(level: number) {
  return TITLES.find(([threshold]) => level >= threshold)![1];
}
export async function sparksSummary(env: Env, user: string) {
  const r = await first(
    env,
    `SELECT COALESCE(SUM(amount),0) balance,COALESCE(SUM(CASE WHEN spend=0 THEN amount ELSE 0 END),0) lifetime FROM sparks_ledger WHERE user_id=?`,
    user,
  );
  const lifetime = Number(r!.lifetime),
    level = levelFor(lifetime);
  return {
    balance: Number(r!.balance),
    lifetime,
    level,
    title: titleFor(level),
  };
}
// Conditions are evaluated by SQLite inside the caller's D1 batch, after its domain write.
export function award(
  env: Env,
  user: string,
  action: keyof typeof SPARKS,
  subject: string,
  post: string | null,
  condition = "1",
  args: unknown[] = [],
  reference = subject,
) {
  const time = now(),
    cap = CAPS[action];
  return statement(
    env,
    `INSERT OR IGNORE INTO sparks_ledger(id,user_id,action,subject,reference,amount,created,post)
 SELECT ?,?,?,?,?,?,?,? WHERE (${condition})
 AND NOT EXISTS(SELECT 1 FROM seed_studio WHERE user_id=?)
 ${cap ? `AND (SELECT COUNT(*) FROM sparks_ledger WHERE user_id=? AND action=? AND amount>0 AND created>=?)<${cap}` : ""}`,
    id("spark"),
    user,
    action,
    subject,
    reference,
    SPARKS[action],
    time,
    post,
    ...args,
    user,
    ...(cap ? [user, action, Math.floor(time / 86400000) * 86400000] : []),
  );
}
export function reverse(env: Env, condition: string, args: unknown[]) {
  return statement(
    env,
    `INSERT OR IGNORE INTO sparks_ledger(id,user_id,action,subject,reference,amount,created,post,reversal_of)
 SELECT 'reverse:'||s.id,s.user_id,'reverse',s.id,s.reference,-s.amount,?,s.post,s.id FROM sparks_ledger s WHERE s.amount>0 AND s.spend=0 AND (${condition})`,
    now(),
    ...args,
  );
}
export const BADGES = [
  "First Light",
  "Gallery of Ten",
  "Explorer",
  "Crowd Favorite",
  "Beloved",
  "First Words",
  "Conversationalist",
  "Patron",
  "Curator",
  "Shelf Builder",
  "Collector",
  "Early Reader",
] as const;
export function levelNotice(env: Env, user: string) {
  return statement(
    env,
    `INSERT OR IGNORE INTO notifications(id,user_id,kind,subject,created)
 WITH RECURSIVE levels(l) AS (SELECT 2 UNION ALL SELECT l+1 FROM levels WHERE ${LEVEL_FACTOR}*(l+1)*l <= (SELECT COALESCE(SUM(amount),0) FROM sparks_ledger WHERE user_id=? AND spend=0))
 SELECT 'level:'||?||':'||MAX(l),?,'level',CAST(MAX(l) AS TEXT),? FROM levels
 HAVING (SELECT COALESCE(SUM(amount),0) FROM sparks_ledger WHERE user_id=? AND spend=0)>=${sparksForLevel(2)}
 AND NOT EXISTS(SELECT 1 FROM seed_studio WHERE user_id=?)`,
    user,
    user,
    user,
    now(),
    user,
    user,
  );
}
export function badgeWrites(env: Env, user: string, publicationOnly = false) {
  const tests: Record<string, string> = {
    "First Light": `(SELECT count(*) FROM posts WHERE owner=? AND removed IS NULL)>=1`,
    "Gallery of Ten": `(SELECT count(*) FROM posts WHERE owner=? AND removed IS NULL)>=10`,
    Explorer: `(SELECT count(DISTINCT book) FROM posts WHERE owner=? AND removed IS NULL)>=5`,
    "Crowd Favorite": `EXISTS(SELECT 1 FROM posts p JOIN upvotes u ON p.id=u.post WHERE p.owner=? AND p.removed IS NULL GROUP BY p.id HAVING count(*)>=25)`,
    Beloved: `(SELECT count(*) FROM upvotes u JOIN posts p ON p.id=u.post WHERE p.owner=? AND p.removed IS NULL)>=100`,
    "First Words": `(SELECT count(*) FROM comments WHERE user_id=? AND removed IS NULL)>=1`,
    Conversationalist: `(SELECT count(*) FROM comments WHERE user_id=? AND removed IS NULL)>=50`,
    Patron: `(SELECT count(*) FROM upvotes u JOIN posts p ON p.id=u.post WHERE u.user_id=? AND p.removed IS NULL)>=100`,
    Curator: `(SELECT count(*) FROM favorites f JOIN posts p ON p.id=f.post WHERE f.user_id=? AND p.removed IS NULL)>=25`,
    "Shelf Builder": `(SELECT count(*) FROM shelf WHERE user_id=?)>=10`,
    Collector: `(SELECT count(*) FROM store_ownership WHERE user_id=?)>=5`,
    "Early Reader": `EXISTS(SELECT 1 FROM user WHERE id=?)`,
  };
  return [
    levelNotice(env, user),
    ...Object.entries(tests)
      .filter(
        ([badge]) =>
          !publicationOnly ||
          ["First Light", "Gallery of Ten", "Explorer"].includes(badge),
      )
      .flatMap(([badge, test]) => [
        statement(
          env,
          `INSERT OR IGNORE INTO badges SELECT ?,?,? WHERE ${test} AND NOT EXISTS(SELECT 1 FROM seed_studio WHERE user_id=?)`,
          user,
          badge,
          now(),
          user,
          user,
        ),
        statement(
          env,
          `INSERT OR IGNORE INTO notifications(id,user_id,kind,subject,created) SELECT ?,?,'badge',?,? WHERE EXISTS(SELECT 1 FROM badges WHERE user_id=? AND badge=?)`,
          id("notice"),
          user,
          badge,
          now(),
          user,
          badge,
        ),
      ]),
  ];
}
export async function outcome(
  env: Env,
  user: string,
  before: Awaited<ReturnType<typeof sparksSummary>>,
  oldBadges: string[] = [],
) {
  const summary = await sparksSummary(env, user);
  const newBadges = (
    await rows(env, "SELECT badge FROM badges WHERE user_id=?", user)
  )
    .map((r) => r.badge as string)
    .filter((b) => !oldBadges.includes(b));
  return {
    ...summary,
    delta: summary.lifetime - before.lifetime,
    leveledUp: summary.level > before.level,
    newBadges,
  };
}
// Called within publication's transaction; studio publications remain unchanged.
export function publicationWrites(env: Env, user: string, post: string) {
  return [
    award(
      env,
      user,
      "publish",
      post,
      post,
      "EXISTS(SELECT 1 FROM posts WHERE id=? AND removed IS NULL)",
      [post],
    ),
    award(
      env,
      user,
      "firstBook",
      post,
      post,
      `EXISTS(SELECT 1 FROM posts p WHERE p.id=? AND NOT EXISTS(SELECT 1 FROM posts other WHERE other.book=p.book AND other.id<>p.id))`,
      [post],
    ),
    ...badgeWrites(env, user, true),
  ];
}
export function removalWrites(env: Env, post: string) {
  return [
    reverse(env, "s.post=?", [post]),
    statement(env, "DELETE FROM notifications WHERE post=?", post),
    statement(
      env,
      "UPDATE comments SET removed=COALESCE(removed,?) WHERE post=?",
      now(),
      post,
    ),
  ];
}
