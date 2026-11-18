import { Hono } from "hono";
import * as C from "@fanflare/contracts";
import {
  type App,
  type Web,
  page,
  hidden,
  keyField,
  positionLabel,
} from "./view.tsx";
import { required, rows, first, fail } from "./common.ts";
import {
  canSeePost,
  characterVisibilitySql,
  postVisibilitySql,
} from "./visibility.ts";
import { canvasNeighbours } from "./canvas.ts";
import {
  canvasQuery,
  canvasParams,
  parseCanvasScope,
} from "./ui/canvas-view.tsx";
import { ViewerFrame, Avatar } from "./ui/components.tsx";
import { type AvatarProfile, artUrl } from "./images.ts";
import { PersonLink } from "./ui/person.tsx";
import { coverUrl } from "./catalog.ts";
import { searchCanvasNeighbours } from "./site-search.ts";
import { listComments } from "./social.ts";
import { sparksSummary } from "./sparks.ts";
export const viewerRoutes = new Hono<App>();
async function viewerData(c: Web) {
  const post = c.req.param("post") ?? fail("Artwork required");
  if (!(await canSeePost(c.env, c.get("prefs"), post)))
    fail("Artwork unavailable at your reading position", 404);
  const visibility = postVisibilitySql(c.get("prefs"));
  const p = await required(
    c.env,
    `SELECT p.*,b.title,b.authors,a.width,a.height,pr.handle,pr.private,pr.avatar,pr.studio FROM posts p JOIN books b ON b.id=p.book JOIN assets a ON a.id=p.asset LEFT JOIN profiles pr ON pr.user_id=p.owner WHERE p.id=? AND ${visibility.sql}`,
    post,
    ...visibility.args,
  );
  const m = C.metadata.parse(JSON.parse(p.metadata)),
    user = c.get("reader"),
    raw = c.req.query("scope");
  let params: URLSearchParams;
  let neighboursPromise;
  if (raw === "search") {
    const search = await searchCanvasNeighbours(
      c.env,
      c.get("prefs"),
      post,
      c.req.query(),
    );
    params = new URLSearchParams({
      scope: "search",
      ...Object.fromEntries(
        Object.entries(search.query)
          .filter(([, value]) => value !== undefined)
          .map(([key, value]) => [key, String(value)]),
      ),
    });
    neighboursPromise = Promise.resolve(search.neighbours);
  } else {
    const query = canvasQuery(c),
      scope = await parseCanvasScope(c, raw || "book:" + p.book);
    params = new URLSearchParams({
      ...canvasParams(query),
      scope: raw || "book:" + p.book,
    });
    neighboursPromise = canvasNeighbours(
      c.env,
      c.get("prefs"),
      post,
      { scope, ...query, cursor: undefined },
      user?.id,
    );
  }
  const link = (id: string) =>
    "/posts/" + encodeURIComponent(id) + "?" + params;
  const v = characterVisibilitySql(c.get("prefs"));
  const [neighbours, comments, counts, characters, level, cover] =
    await Promise.all([
      neighboursPromise,
      listComments(c.env, post, c.get("prefs")),
      first(c.env, "SELECT count(*) count FROM upvotes WHERE post=?", post),

      rows(
        c.env,
        `SELECT c.id,c.name FROM characters c WHERE c.book=? AND c.id IN (SELECT value FROM json_each(?)) AND ${v.sql}`,
        p.book,
        JSON.stringify(m.character_ids),
        ...v.args,
      ),
      p.handle && !p.studio ? sparksSummary(c.env, p.owner) : null,
      coverUrl(c.env, p.book),
    ]);
  const next = "/posts/" + post;
  const toggle = async (kind: "upvote" | "favorite") => {
    const active =
      user &&
      !!(await first(
        c.env,
        `SELECT 1 FROM ${kind === "upvote" ? "upvotes" : "favorites"} WHERE post=? AND user_id=?`,
        post,
        user.id,
      ));
    if (!user)
      return (
        <a
          class="btn secondary"
          href={"/sign-in?next=" + encodeURIComponent(next)}
        >
          {kind === "upvote" ? "Upvote · " + counts!.count : "Favorite"}
        </a>
      );
    if (kind === "upvote" && user.id === p.owner)
      return <span class="tag">{counts!.count} upvotes</span>;
    return (
      <form
        method="post"
        action={"/api/" + kind}
        data-social-form
        data-toggle={kind}
      >
        {keyField()}
        {hidden("post", post)}
        {hidden("active", active ? "false" : "true")}
        {hidden("next", next)}
        <button
          class="secondary"
          aria-pressed={active ? "true" : "false"}
          data-viewer-action={kind}
        >
          {kind === "upvote"
            ? "↑ Upvote · " + counts!.count
            : active
              ? "♥ Favorited"
              : "♡ Favorite"}
        </button>
      </form>
    );
  };
  const frame = (
    <ViewerFrame
      title={p.title}
      media={
        <img
          src={artUrl(p.asset, "display")}
          width={p.width}
          height={p.height}
          alt={m.alt}
        />
      }
      panel={
        <>
          <a class="viewer-book" href={"/books/" + p.book}>
            <img src={cover} alt="" width="40" height="60" />
            <span>
              <small>From the pages of</small>
              <strong>{p.title}</strong>
            </span>
          </a>
          <div class="viewer-byline">
            {p.handle ? (
              <PersonLink handle={p.handle} private={p.private}>
                <Avatar
                  profile={{
                    handle: p.handle,
                    avatar: JSON.parse(p.avatar),
                    private: !!p.private,
                  }}
                />
                <span>
                  <strong>{m.credit}</strong>
                  <small>
                    {[
                      !p.private && "@" + p.handle,
                      level && "Level " + level.level + " " + level.title,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </small>
                </span>
              </PersonLink>
            ) : (
              <strong>{m.credit}</strong>
            )}
          </div>
          <p class="viewer-description">{m.alt}</p>
          <div class="chiplist">
            {[m.style, m.mood, ...characters.map((ch) => ch.name)]
              .filter(Boolean)
              .map((t) => (
                <span class="tag">{t}</span>
              ))}
          </div>
          <p class="viewer-date">
            {positionLabel(m.position)}
            <br />
            <time datetime={new Date(p.approved).toISOString()}>
              {new Date(p.approved).toLocaleDateString("en", {
                dateStyle: "medium",
                timeZone: "UTC",
              })}
            </time>
          </p>
          <div class="viewer-actions">
            {await toggle("upvote")}
            {await toggle("favorite")}
            <a
              class="btn secondary"
              href={next}
              data-share-url={c.env.ORIGIN + next}
            >
              Share ↗
            </a>
            <a href={"/contact?type=post&target=" + post}>Report</a>
          </div>
          <nav class="viewer-neighbours" aria-label="Artwork navigation">
            {neighbours.previous ? (
              <a
                href={link(neighbours.previous.id)}
                data-viewer-previous
                data-viewer-fragment={
                  "/api/posts/" + neighbours.previous.id + "/viewer?" + params
                }
              >
                ← Previous
              </a>
            ) : (
              <span />
            )}
            {neighbours.next && (
              <a
                href={link(neighbours.next.id)}
                data-viewer-next
                data-viewer-fragment={
                  "/api/posts/" + neighbours.next.id + "/viewer?" + params
                }
              >
                Next →
              </a>
            )}
          </nav>
          <section
            class="viewer-comments"
            data-comments
            aria-labelledby={"comments-" + post}
          >
            <h2 id={"comments-" + post}>
              Comments <span>{comments.length}</span>
            </h2>
            {!comments.length && <p class="muted">No comments yet.</p>}
            {comments.map((comment) => (
              <article class="viewer-comment">
                <PersonLink
                  class="comment-author"
                  handle={comment.handle}
                  private={comment.private}
                >
                  <Avatar profile={comment as AvatarProfile} size="xs" />
                  <strong>{comment.display_name}</strong>
                </PersonLink>
                <time datetime={new Date(comment.created).toISOString()}>
                  {new Date(comment.created).toLocaleDateString("en", {
                    month: "short",
                    day: "numeric",
                    timeZone: "UTC",
                  })}
                </time>
                <p>{comment.body}</p>
                <div class="comment-actions">
                  {user?.id === comment.user_id && (
                    <form
                      method="post"
                      action="/api/comment-delete"
                      data-social-form
                      data-comment-action
                    >
                      {keyField()}
                      {hidden("comment", comment.id)}
                      {hidden("next", next)}
                      <button class="text-link">Delete</button>
                    </form>
                  )}
                  <details>
                    <summary>Report</summary>
                    {user ? (
                      <form
                        method="post"
                        action="/api/report-comment"
                        data-social-form
                      >
                        {keyField()}
                        {hidden("target", comment.id)}
                        {hidden("next", next)}
                        <label>
                          Reason
                          <textarea name="detail" required maxLength={1000} />
                        </label>
                        <button class="secondary">Send report</button>
                      </form>
                    ) : (
                      <a href={"/sign-in?next=" + encodeURIComponent(next)}>
                        Sign in to report
                      </a>
                    )}
                  </details>
                </div>
              </article>
            ))}
            {user ? (
              <form
                method="post"
                action="/api/comment"
                class="stack comment-compose"
                data-social-form
                data-comment-action
              >
                {keyField()}
                {hidden("post", post)}
                {hidden("next", next)}
                <label>
                  Add your perspective
                  <textarea name="body" required maxLength={1000} rows={3} />
                </label>
                <button>Post comment</button>
              </form>
            ) : (
              <p class="comment-prompt">
                <a href={"/sign-in?next=" + encodeURIComponent(next)}>
                  Sign in to join the conversation →
                </a>
              </p>
            )}
          </section>
          {(user?.id === p.owner || c.get("moderator")) && (
            <form method="post" action={"/posts/" + post + "/remove"}>
              <button class="text-link">Remove artwork</button>
            </form>
          )}
        </>
      }
    />
  );
  return { frame, p, m };
}
viewerRoutes.get("/api/posts/:post/viewer", async (c) => {
  const { frame } = await viewerData(c);
  c.header("Cache-Control", "private, no-store");
  c.header("X-Robots-Tag", "noindex, nofollow");
  return c.html(frame);
});
viewerRoutes.get("/posts/:post", async (c) => {
  const { frame, p, m } = await viewerData(c);
  return page(
    c,
    "Artwork · " + p.title,
    <div class="artwork-permalink">
      <a class="book-back" href={"/books/" + p.book}>
        ← Back to {p.title}
      </a>
      <h1 class="visually-hidden">Artwork for {p.title}</h1>
      {frame}
    </div>,
    {
      public: true,
      path: "/posts/" + p.id,
      description: "Artwork for " + p.title + " by " + m.credit + ".",
      image: c.env.ORIGIN + artUrl(p.asset, "display"),
      styles: ["viewer"],
      modules: ["comments"],
    },
  );
});
