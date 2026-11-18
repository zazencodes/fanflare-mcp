import { artUrl } from "./images.ts";
import { z } from "zod";
import * as C from "@fanflare/contracts";
import {
  type Env,
  first,
  required,
  rows,
  statement,
  fail,
  id,
  now,
  digest,
  writeOnce,
} from "./common.ts";
import {
  factVisibilitySql,
  publicFactId,
  reportClaimIdentitySql,
  publicSubjectId,
} from "./visibility.ts";
const factReadTables =
  "facts f JOIN sources s ON s.id=f.source LEFT JOIN characters c ON c.id=f.character LEFT JOIN contributions u ON u.id=f.contribution";
export const getBook = (env: Env, book: string) =>
  required(env, "SELECT * FROM books WHERE id=?", book);
const norm = (s: string) =>
  s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/['’]/g, "’")
    .replace(/\s+/g, " ")
    .trim();
// Shared deterministic identity for catalog imports and operator preparation.
export async function catalogBookIdentity(
  title: string,
  authors: string[],
  disambiguator = "",
) {
  const identity = [
    norm(title),
    authors.map(norm).sort().join(","),
    norm(disambiguator),
  ].join("|");
  return { identity, bookId: "book_" + (await digest(identity)).slice(0, 32) };
}
export async function search(
  env: Env,
  input: z.infer<typeof C.query>,
): Promise<import("./common.ts").Row[]> {
  const terms = input.query.match(/[\p{L}\p{N}]+/gu) ?? [];
  const clauses: string[] = [],
    args: unknown[] = [];
  if (terms.length) {
    clauses.push(
      "b.id IN (SELECT id FROM book_search WHERE book_search MATCH ?)",
    );
    args.push(terms.map((t) => '"' + t + '"*').join(" AND "));
  }
  if (input.author) {
    clauses.push(
      "EXISTS(SELECT 1 FROM json_each(b.authors) WHERE instr(lower(value),lower(?))>0)",
    );
    args.push(input.author);
  }
  if (input.isbn) {
    clauses.push("EXISTS(SELECT 1 FROM editions WHERE book=b.id AND isbn=?)");
    args.push(input.isbn.replace(/[- ]/g, ""));
  }
  const matches = await rows(
    env,
    `SELECT b.id,b.title,b.authors,b.disambiguator,COALESCE(MAX(p.approved),b.created) activity,COUNT(p.id) posts,(SELECT external_id FROM work_identities WHERE book=b.id AND provider='openlibrary' LIMIT 1) work_key,(SELECT COUNT(*) FROM ${factReadTables} WHERE f.book=b.id AND f.kind='fact' AND ${factVisibilitySql(null).sql}) facts,(SELECT json_group_array(id_label) FROM editions WHERE book=b.id) editions FROM books b LEFT JOIN posts p ON p.book=b.id AND p.removed IS NULL ` +
      (clauses.length ? "WHERE " + clauses.join(" AND ") : "") +
      " GROUP BY b.id ORDER BY activity DESC,b.id LIMIT 50 OFFSET ?",
    ...args,
    (input.page - 1) * 50,
  );
  return matches.map((b) => ({
    ...b,
    authors: JSON.parse(b.authors),
    editions: JSON.parse(b.editions),
  }));
}
export async function boundary(
  env: Env,
  book: string,
  p: z.infer<typeof C.position>,
): Promise<number | null> {
  if (p.kind === "unknown") return null;
  if (p.kind === "page") {
    if (!p.edition_id) return null;
    return (
      (
        await first(
          env,
          "SELECT boundary FROM page_map JOIN editions ON editions.id=edition WHERE book=? AND edition=? AND page=?",
          book,
          p.edition_id,
          p.page,
        )
      )?.boundary ?? null
    );
  }
  if (
    !(await first(
      env,
      "SELECT ord FROM chapters WHERE book=? AND ord=?",
      book,
      p.chapter,
    ))
  )
    return null;
  if (p.kind === "anchor") {
    const a = await first(
      env,
      "SELECT point FROM anchors WHERE book=? AND chapter=? AND slug=?",
      book,
      p.chapter,
      p.anchor,
    );
    return a ? p.chapter * 100000 + a.point : null;
  }
  return p.chapter * 100000 + (p.kind === "finished" ? 99999 : 0);
}
async function completionPosition(env: Env, book: string) {
  const row = await first(
    env,
    `SELECT json_extract(a.packet,'$.chapters.status') status,
      json_extract(a.packet,'$.chapters.count') count
     FROM context_imports i JOIN context_approvals a
       ON a.book=i.book AND a.revision=i.revision AND a.packet_hash=i.packet_hash
     WHERE i.book=? AND i.rolled_back=0`,
    book,
  );
  if (!row) return null;
  const chapter =
    row.status === "verified"
      ? row.count
      : row.status === "partial" || row.status === "unknown"
        ? 9999
        : null;
  if (
    !Number.isInteger(chapter) ||
    !(await first(
      env,
      "SELECT 1 FROM chapters WHERE book=? AND ord=?",
      book,
      chapter,
    ))
  )
    return null;
  return {
    position: { kind: "finished" as const, chapter },
    chapter_precision:
      row.status === "verified" ? "verified_end" : "unverified_end",
    instruction:
      "Use this position only when the reader explicitly confirms they finished the whole book. It is a book-completion boundary; an unverified end does not indicate chapter precision. Never expand a supplied reading boundary without that confirmation.",
  };
}
export async function context(env: Env, v: z.infer<typeof C.scene>) {
  const b = await getBook(env, v.book_id);
  let through = v.position;
  if (
    v.scene_cues &&
    (through.kind === "unknown" || through.kind === "reading")
  ) {
    const cues = await rows(
      env,
      "SELECT chapter,anchor FROM passage_cues WHERE book=? AND instr(lower(?),lower(phrase))>0 AND (? IS NULL OR chapter=?)",
      b.id,
      v.scene_cues,
      through.kind === "reading" ? through.chapter : null,
      through.kind === "reading" ? through.chapter : null,
    );
    if (cues.length === 1)
      through = {
        kind: "anchor",
        chapter: cues[0].chapter,
        anchor: cues[0].anchor,
      };
  }
  const limit = await boundary(env, b.id, through);
  if (limit === null)
    return {
      book_id: b.id,
      state: "clarification",
      facts: [],
      whole_book_completion: await completionPosition(env, b.id),
      visual_guidance: {
        completeness: "not_established",
        reading_position_needed: true,
        instruction:
          "Ask for the reader's position and any scene, character or place details needed for their image. A photo of a relevant short passage or an original sketch may be offered as private evidence for review; it is not automatically published or reference art. Do not infer canon from generated artwork or sketches.",
      },
      next_action:
        "Ask for a verified chapter or passage anchor. Page numbers require a mapped edition. If the reader explicitly finished the whole book, use the provided whole-book completion position when available.",
    };
  const visibility = factVisibilitySql(limit);
  const data = await rows(
    env,
    `SELECT f.id,c.id character_id,c.name subject,cs.kind subject_kind,f.detail,f.kind,s.label source,s.url,f.locator,f.credit,
 EXISTS(SELECT 1 FROM reports r LEFT JOIN context_report_claims rc ON rc.report=r.id WHERE r.target_type='fact' AND r.resolved IS NULL AND ${reportClaimIdentitySql}) under_review,
 CASE WHEN u.image_approved=1 AND u.original_sketch=1 AND u.reference=1 AND u.display=1 AND u.state='accepted' AND a.object_prefix IS NOT NULL THEN a.id END reference_asset
 FROM facts f JOIN sources s ON s.id=f.source LEFT JOIN characters c ON c.id=f.character LEFT JOIN context_subjects cs ON cs.subject=c.id LEFT JOIN contributions u ON u.id=f.contribution LEFT JOIN assets a ON a.id=u.asset
 WHERE f.book=? AND ${visibility.sql} AND (f.kind!='interpretation' OR ?=1)
 ORDER BY f.reveal,f.id`,
    b.id,
    ...visibility.args,
    +v.interpretations,
  );
  const names = await rows(
    env,
    "SELECT a.name,c.id FROM aliases a JOIN characters c ON c.id=a.character WHERE c.book=? AND c.reveal<=? AND a.reveal<=?",
    b.id,
    limit,
    limit,
  );
  const wanted = v.visible_names.map(norm),
    matched = new Set(
      names.filter((a) => wanted.includes(norm(a.name))).map((a) => a.id),
    );
  const filtered = data.filter(
    (f) =>
      !wanted.length ||
      !f.subject ||
      wanted.includes(norm(f.subject)) ||
      matched.has(f.character_id),
  );
  const withReference = async (f: (typeof filtered)[number]) => {
    const { id: internalId, character_id, reference_asset, ...visible } = f;
    return {
      ...visible,
      id: await publicFactId(b.id, internalId),
      character_id: character_id
        ? await publicSubjectId(b.id, character_id)
        : null,
      reference: f.reference_asset
        ? {
            url: env.ORIGIN + artUrl(f.reference_asset, "display"),
            format: "image/webp",
            credit: f.credit,
          }
        : undefined,
    };
  };
  return {
    book_id: b.id,
    through,
    state: "partial",
    visual_guidance: {
      completeness: "not_established",
      reading_position_needed: false,
      scene_description: v.scene_cues ? "reader_supplied" : "not_supplied",
      requested_subject_context: !wanted.length
        ? "not_requested"
        : wanted.every((name) =>
              filtered.some(
                (f) =>
                  f.subject &&
                  (norm(f.subject) === name ||
                    names.some(
                      (a) => norm(a.name) === name && a.id === f.character_id,
                    )),
              ),
            )
          ? "available"
          : "some_unavailable",
      instruction:
        "These visible facts do not establish a complete visual profile. If details needed for the requested image are missing, ask the reader for their description of the scene, character or place and reading position. They may offer a photo of a relevant short passage or an original sketch as private evidence for review; it is not automatically published or reference art. Do not infer canon from generated artwork or sketches. Proceed without further intake when the supplied details suffice.",
    },
    facts: await Promise.all(
      filtered.filter((f) => f.kind === "fact").map(withReference),
    ),
    unknown: filtered.filter((f) => f.kind === "unknown").map((f) => f.detail),
    unknown_claims: await Promise.all(
      filtered.filter((f) => f.kind === "unknown").map(withReference),
    ),
    disputed: await Promise.all(
      filtered.filter((f) => f.kind === "disputed").map(withReference),
    ),
    interpretations: await Promise.all(
      filtered.filter((f) => f.kind === "interpretation").map(withReference),
    ),
    next_action: filtered.length
      ? "Illustrate with these details and the reader’s observations. Ask before sharing."
      : "Offer indexing or a reader contribution.",
  };
}
export async function indexStatus(env: Env, book: string) {
  await getBook(env, book);
  const latest = await first(
    env,
    "SELECT id,state,reason,created FROM jobs WHERE book=? ORDER BY created DESC,id DESC LIMIT 1",
    book,
  );
  const coverage = await rows(
    env,
    `SELECT CAST(f.reveal/100000 AS INTEGER) chapter,COUNT(*) facts FROM ${factReadTables} WHERE f.book=? AND f.kind='fact' AND ${factVisibilitySql(null).sql} GROUP BY chapter ORDER BY chapter`,
    book,
  );
  const pause = await first(
    env,
    "SELECT pause_until FROM runner_status WHERE pause_until>?",
    now(),
  );
  const whole_book_completion = await completionPosition(env, book);
  return {
    book_id: book,
    job: latest,
    coverage:
      whole_book_completion?.chapter_precision === "unverified_end"
        ? coverage.filter((entry) => entry.chapter !== 9999)
        : coverage,
    whole_book_completion,
    delay:
      pause && latest?.state === "queued"
        ? "Daily research budget reached"
        : null,
    status_url: env.ORIGIN + "/status/" + book,
    next_action: "Read available context, check back, or contribute evidence.",
  };
}
export async function requestIndex(
  env: Env,
  user: string,
  v: z.infer<typeof C.request>,
) {
  let book = v.book_id,
    identity = "";
  if (v.work_key) {
    const verified = await required(
      env,
      "SELECT book FROM work_identities WHERE provider='openlibrary' AND external_id=?",
      v.work_key,
    );
    if (book && book !== verified.book) fail("Work identifiers conflict", 409);
    book = verified.book;
  }
  if (book) await getBook(env, book);
  else {
    const catalog = await catalogBookIdentity(
      v.title!,
      v.authors!,
      v.disambiguator,
    );
    identity = catalog.identity;
    book =
      (await first(env, "SELECT id FROM books WHERE identity=?", identity))
        ?.id ?? catalog.bookId;
  }
  const resource = await writeOnce(env, user, "index", v, async () => {
    const writes: D1PreparedStatement[] = [];
    if (!v.book_id && !v.work_key)
      writes.push(
        statement(
          env,
          "INSERT INTO books VALUES(?,?,?,?,?,?) ON CONFLICT(identity) DO NOTHING",
          book,
          identity,
          v.title,
          JSON.stringify(v.authors),
          v.disambiguator ?? null,
          now(),
        ),
      );
    if (v.isbn) {
      const ed = await first(
        env,
        "SELECT book FROM editions WHERE isbn=?",
        v.isbn,
      );
      if (ed && ed.book !== book) fail("ISBN belongs to a different work", 409);
      if (!ed)
        writes.push(
          statement(
            env,
            "INSERT INTO editions VALUES(?,?,?,?)",
            id("ed"),
            book,
            "ISBN " + v.isbn,
            v.isbn,
          ),
        );
    }
    const rid = id("request");
    writes.push(
      statement(
        env,
        `INSERT OR IGNORE INTO jobs(id,book,state,requested,created,eligible) SELECT ?,?,'queued',?,?,? WHERE ? IS NOT NULL OR NOT EXISTS(SELECT 1 FROM ${factReadTables} WHERE f.book=? AND f.kind='fact' AND ${factVisibilitySql(null).sql})`,
        id("job"),
        book,
        v.missing_coverage ?? null,
        now(),
        now(),
        v.missing_coverage ?? null,
        book,
      ),
      statement(
        env,
        "INSERT INTO index_requests(id,book,job,coverage) SELECT ?,?,(SELECT id FROM jobs WHERE book=? AND state IN ('running','queued') LIMIT 1),?",
        rid,
        book,
        book,
        v.missing_coverage ?? null,
      ),
    );
    return { resource: rid, writes };
  });
  const r = await required(
    env,
    "SELECT * FROM index_requests WHERE id=?",
    resource,
  );
  return {
    ...(await indexStatus(env, r.book)),
    requested_job: r.job
      ? await first(env, "SELECT id,state,reason FROM jobs WHERE id=?", r.job)
      : null,
  };
}

// Operator-reviewed seed catalog entries use the same identity normalization as requests,
// but do not create index requests or research jobs.
export async function seedCatalogBook(
  env: Env,
  operator: string,
  v: {
    seedId: string;
    title: string;
    authors: string[];
    isbn: string | null;
    request_key: string;
  },
) {
  C.short.parse(v.title);
  z.array(C.short).min(1).max(12).parse(v.authors);
  const isbn = v.isbn === null ? null : C.isbn.parse(v.isbn);
  const catalog = await catalogBookIdentity(v.title, v.authors);
  const identity = catalog.identity;
  const book =
    (await first(env, "SELECT id FROM books WHERE identity=?", identity))?.id ??
    catalog.bookId;
  const bound = await first(
    env,
    "SELECT book_id FROM seed_catalog WHERE seed_id=?",
    v.seedId,
  );
  if (bound && bound.book_id !== book)
    fail("Seed work is already bound to a different book", 409);
  const result = await writeOnce(env, operator, "seed-catalog", v, async () => {
    if (isbn) {
      const existing = await first(
        env,
        "SELECT book FROM editions WHERE isbn=?",
        isbn,
      );
      if (existing && existing.book !== book)
        fail("ISBN belongs to a different work", 409);
    }
    return {
      resource: book,
      writes: [
        statement(
          env,
          "INSERT INTO books VALUES(?,?,?,?,?,?) ON CONFLICT(identity) DO NOTHING",
          book,
          identity,
          v.title,
          JSON.stringify(v.authors),
          null,
          now(),
        ),
        statement(
          env,
          "INSERT INTO seed_catalog(seed_id,book_id) VALUES(?,?) ON CONFLICT(seed_id) DO UPDATE SET book_id=CASE WHEN book_id=excluded.book_id THEN book_id ELSE NULL END",
          v.seedId,
          book,
        ),
        ...(isbn
          ? [
              statement(
                env,
                "INSERT INTO editions(id,book,id_label,isbn) SELECT ?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM editions WHERE isbn=?)",
                id("ed"),
                book,
                "ISBN " + isbn,
                isbn,
                isbn,
              ),
            ]
          : []),
      ],
    };
  });
  return { book_id: result };
}
