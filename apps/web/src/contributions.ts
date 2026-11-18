import { z } from "zod";
import * as C from "@fanflare/contracts";
import { getBook, boundary } from "./books.ts";
import {
  type Env,
  fail,
  id,
  statement,
  required,
  first,
  rows,
  now,
  writeOnce,
} from "./common.ts";
import { publicSubjectId, factVisibilitySql } from "./visibility.ts";
import { artTag, purgeImages } from "./images.ts";
export async function submit(
  env: Env,
  user: string,
  v: z.infer<typeof C.contribute>,
) {
  const cid = await writeOnce(env, user, "contribute", v, async () => {
    await getBook(env, v.book_id);
    if (v.asset_id) {
      await required(
        env,
        "SELECT id FROM assets WHERE id=? AND owner=? AND book=? AND purpose='evidence' AND object_prefix IS NOT NULL AND expires>?",
        v.asset_id,
        user,
        v.book_id,
        now(),
      );
      if (
        await first(
          env,
          "SELECT id FROM contributions WHERE asset=?",
          v.asset_id,
        )
      )
        fail("Evidence already submitted", 409);
    }
    const point = await boundary(env, v.book_id, v.position);
    if (v.position.kind !== "unknown" && point === null)
      fail("Unverified position");
    const visibility = factVisibilitySql(point);
    const visible =
      point === null
        ? []
        : await rows(
            env,
            `SELECT c.id,c.name,COALESCE(cs.kind,'character') subject_kind FROM characters c LEFT JOIN context_subjects cs ON cs.subject=c.id WHERE c.book=? AND (c.reveal<=? OR (c.reveal IS NULL AND EXISTS(SELECT 1 FROM facts f JOIN sources s ON s.id=f.source LEFT JOIN contributions u ON u.id=f.contribution WHERE f.character=c.id AND ${visibility.sql})))`,
            v.book_id,
            point,
            ...visibility.args,
          );
    const subject = (
      await Promise.all(
        visible.map(async (s) => ({
          id: s.id,
          name: s.name,
          subject_kind: s.subject_kind,
          public_id: await publicSubjectId(v.book_id, s.id),
        })),
      )
    ).find(
      (s) =>
        s.id === v.character ||
        s.public_id === v.character ||
        s.name === v.character,
    );
    const identifier =
      /^[a-f0-9]{64}$/.test(v.character) ||
      /^[a-z0-9]+(?:[_:][a-z0-9:_-]+)+$/.test(v.character);
    if (identifier && !subject) fail("Subject unavailable", 404);
    const subjectKind = v.subject_kind ?? "character";
    if (subject && subject.subject_kind !== subjectKind)
      fail("Subject unavailable", 404);
    const cid = id("contribution"),
      writes = [
        statement(
          env,
          "INSERT INTO contributions(id,owner,book,subject,description,asset,kind,source,position,credit,display,reference,external_model,created,original_sketch,subject_kind) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
          cid,
          user,
          v.book_id,
          subject?.name ?? v.character,
          v.description ?? null,
          v.asset_id ?? null,
          v.kind,
          v.source ?? null,
          JSON.stringify(v.position),
          v.credit,
          +v.allow_display,
          +v.allow_reference,
          +v.allow_external_model,
          now(),
          +v.original_sketch,
          subjectKind,
        ),
      ];
    if (v.asset_id)
      writes.push(
        statement(
          env,
          "UPDATE assets SET expires=? WHERE id=?",
          now() + 30 * 86400000,
          v.asset_id,
        ),
      );
    return { resource: cid, writes };
  });
  return required(
    env,
    "SELECT id,state,display,reference,external_model,kind FROM contributions WHERE id=?",
    cid,
  );
}
export async function withdraw(env: Env, user: string, cid: string) {
  const c = await required(
    env,
    "SELECT * FROM contributions WHERE id=? AND owner=?",
    cid,
    user,
  );
  await env.DB.batch([
    statement(
      env,
      "UPDATE contributions SET state='withdrawn',description=NULL WHERE id=?",
      cid,
    ),
    statement(env, "UPDATE facts SET active=0 WHERE contribution=?", cid),
    statement(env, "UPDATE assets SET expires=0 WHERE id=?", c.asset),
  ]);
  if (c.asset && c.image_approved) await purgeImages(env, [artTag(c.asset)]);
}
