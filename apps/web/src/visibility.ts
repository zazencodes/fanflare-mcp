import { type Env, first, digest } from "./common.ts";
/** Opaque, revision-independent packet claim identifier; never expose packet keys. */
export async function publicFactId(book: string, id: string) {
  const marker = id.indexOf(":fact:");
  const identity = marker < 0 ? id : id.slice(marker + 6);
  return digest(JSON.stringify([book, identity]));
}
export async function publicSubjectId(book: string, id: string) {
  return digest(JSON.stringify(["subject", book, id]));
}
import type { ReaderPrefs } from "./prefs.ts";
/** Canonical fact visibility. Callers join facts f, sources s, characters c and contributions u. */
export function factVisibilitySql(boundary: number | null) {
  return {
    sql:
      "f.active=1 AND (u.id IS NULL OR u.state='accepted')" +
      " AND NOT EXISTS(SELECT 1 FROM context_suppressions cs WHERE cs.book=f.book AND ((cs.subject_id IS NOT NULL AND cs.subject_id=f.character) OR ((cs.subject_id IS NULL OR NOT EXISTS(SELECT 1 FROM characters old_subject WHERE old_subject.id=cs.subject_id AND old_subject.book=cs.book)) AND cs.subject=COALESCE(c.name,''))) AND cs.detail=f.detail)" +
      " AND NOT EXISTS(SELECT 1 FROM context_suppressed_keys ck WHERE ck.book=f.book AND instr(f.id,':fact:')>0 AND ck.claim_key=substr(f.id,instr(f.id,':fact:')+6))" +
      (boundary === null
        ? ""
        : " AND f.reveal<=? AND s.reveal<=? AND (c.reveal IS NULL OR c.reveal<=?) AND (f.until_point IS NULL OR f.until_point>=?)"),
    args: boundary === null ? [] : [boundary, boundary, boundary, boundary],
  };
}
export function characterVisibilitySql(prefs: ReaderPrefs, alias = "c") {
  if (!/^[a-z][a-z0-9_]*$/i.test(alias)) throw Error("Invalid SQL alias");
  return prefs.spoilersHidden
    ? {
        sql: `${alias}.reveal IS NOT NULL AND ${alias}.reveal <= (SELECT CAST(value AS INTEGER) FROM json_each(?) WHERE key=${alias}.book AND type='integer')`,
        args: [JSON.stringify(prefs.positions)],
      }
    : { sql: "1=1", args: [] };
}
export function postVisibilitySql(prefs: ReaderPrefs, alias = "p") {
  if (!/^[a-z][a-z0-9_]*$/i.test(alias)) throw Error("Invalid SQL alias");
  return {
    sql:
      `${alias}.removed IS NULL AND ${alias}.approved IS NOT NULL` +
      (prefs.spoilersHidden
        ? ` AND ${alias}.boundary IS NOT NULL AND ${alias}.boundary <= (SELECT CAST(value AS INTEGER) FROM json_each(?) WHERE key=${alias}.book AND type='integer')`
        : ""),
    args: prefs.spoilersHidden ? [JSON.stringify(prefs.positions)] : [],
  };
}
export async function canSeePost(
  env: Env,
  prefs: ReaderPrefs,
  postId: string,
): Promise<boolean> {
  const v = postVisibilitySql(prefs);
  return !!(await first(
    env,
    `SELECT 1 FROM posts p WHERE p.id=? AND ${v.sql}`,
    postId,
    ...v.args,
  ));
}
export async function canSeeCharacter(
  env: Env,
  prefs: ReaderPrefs,
  characterId: string,
): Promise<boolean> {
  const v = characterVisibilitySql(prefs);
  return !!(await first(
    env,
    `SELECT 1 FROM characters c WHERE c.id=? AND ${v.sql}`,
    characterId,
    ...v.args,
  ));
}

/** Report identity shared by reader warnings and operator resolution (r, rc, f, c). */
export const reportClaimIdentitySql =
  "(r.target=f.id OR (rc.book=f.book AND ((rc.detail=f.detail AND ((rc.subject_id IS NOT NULL AND rc.subject_id=f.character) OR ((rc.subject_id IS NULL OR NOT EXISTS(SELECT 1 FROM characters old_subject WHERE old_subject.id=rc.subject_id AND old_subject.book=rc.book)) AND rc.subject=COALESCE(c.name,'')))) OR (rc.claim_key IS NOT NULL AND instr(f.id,':fact:')>0 AND rc.claim_key=substr(f.id,instr(f.id,':fact:')+6)))))";
