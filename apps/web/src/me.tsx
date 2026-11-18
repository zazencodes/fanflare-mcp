import { Hono } from "hono";
import {
  type App,
  page,
  Heading,
  reader,
  hidden,
  keyField,
  Position,
} from "./view.tsx";
import { rows, type Env } from "./common.ts";
import { listShelf } from "./social.ts";
import { coverUrls } from "./catalog.ts";
import { postVisibilitySql } from "./visibility.ts";
import { canvasFacets } from "./canvas.ts";
import { canvasQuery, canvasParams, canvasSection } from "./ui/canvas-view.tsx";
import {
  Cover,
  Button,
  EmptyState,
  Segmented,
  Picker,
  Dialog,
} from "./ui/components.tsx";
import type { ReaderPrefs } from "./prefs.ts";

export const me = new Hono<App>();
export function ReaderLinks() {
  return (
    <nav class="reader-links" aria-label="Your reading desk">
      <a href="/me/shelf">Shelf</a>
      <a href="/me/favorites">Favorites</a>
      <a href="/me/avatar">Avatar</a>
      <a href="/account">Settings</a>
    </nav>
  );
}
export async function shelfBooks(env: Env, user: string, prefs: ReaderPrefs) {
  const entries = await listShelf(env, user, prefs);
  const ids = entries.map((entry) => entry.book as string),
    visibility = postVisibilitySql(prefs);
  const [covers, chapters, counts] = await Promise.all([
    coverUrls(env, ids),
    rows(
      env,
      "SELECT book,ord,label FROM chapters WHERE book IN (SELECT value FROM json_each(?)) ORDER BY book,ord",
      JSON.stringify(ids),
    ),
    rows(
      env,
      `SELECT p.book,count(*) n FROM posts p WHERE p.book IN (SELECT value FROM json_each(?)) AND ${visibility.sql} GROUP BY p.book`,
      JSON.stringify(ids),
      ...visibility.args,
    ),
  ]);
  const countByBook = new Map(counts.map((c) => [c.book, c.n]));
  const chaptersByBook = new Map<string, typeof chapters>();
  for (const chapter of chapters) {
    const bookChapters = chaptersByBook.get(chapter.book) ?? [];
    bookChapters.push({ ord: chapter.ord, label: chapter.label });
    chaptersByBook.set(chapter.book, bookChapters);
  }
  return entries.map((entry) => ({
    ...entry,
    state: entry.state as string,
    book: entry.book as string,
    title: entry.title as string,
    authors: entry.authors as string,
    new_art: Number(entry.new_art),
    position: entry.position as number | null,
    cover: covers.get(entry.book)!,
    chapters: chaptersByBook.get(entry.book) ?? [],
    count: countByBook.get(entry.book) ?? 0,
  }));
}
me.get("/me/shelf", async (c) => {
  const books = await shelfBooks(c.env, reader(c).id, c.get("prefs"));
  return page(
    c,
    "Your shelf",
    <>
      <Heading title="Your shelf." sub="Only you can see this shelf." />
      <ReaderLinks />
      {!books.length && (
        <EmptyState
          title="Your shelf is empty"
          icon="books"
          actions={
            <Button href="/books" variant="accent">
              Browse books
            </Button>
          }
        >
          Save a book to Reading, Want to read or Read to keep it close.
        </EmptyState>
      )}
      {(
        [
          ["reading", "Reading"],
          ["want", "Want to read"],
          ["read", "Read"],
        ] as const
      ).map(([state, label]) => (
        <section class="shelf-section" aria-label={label}>
          <div class="section-head">
            <h2>{label}</h2>
            <span class="muted">
              {books.filter((b) => b.state === state).length}{" "}
              {books.filter((b) => b.state === state).length === 1
                ? "book"
                : "books"}
            </span>
          </div>
          <div class="shelf-row">
            {books
              .filter((b) => b.state === state)
              .map((b) => (
                <article class="shelf-book">
                  <Cover
                    src={b.cover}
                    title={b.title}
                    size="fill"
                    href={"/books/" + encodeURIComponent(b.book)}
                  />
                  <h3>
                    <a href={"/books/" + encodeURIComponent(b.book)}>
                      {b.title}
                    </a>
                  </h3>
                  <p class="muted shelf-author">
                    {JSON.parse(b.authors).join(", ")}
                  </p>
                  <p class="shelf-count">
                    {b.count} {b.count === 1 ? "illustration" : "illustrations"}{" "}
                    {b.new_art > 0 && (
                      <span class="tag accent">{b.new_art} new</span>
                    )}
                  </p>
                  <form
                    class="stack"
                    method="post"
                    action="/api/shelf"
                    data-shelf-action
                  >
                    {keyField()}
                    {hidden("book", b.book)}
                    {hidden("next", "/me/shelf")}
                    <label>
                      On your shelf
                      <select name="state">
                        {(
                          [
                            ["reading", "Reading"],
                            ["want", "Want to read"],
                            ["read", "Read"],
                          ] as const
                        ).map(([value, text]) => (
                          <option value={value} selected={b.state === value}>
                            {text}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div class="shelf-actions">
                      <button class="secondary">Move</button>
                      <button class="btn quiet" name="state" value="remove">
                        Remove
                      </button>
                    </div>
                  </form>
                  <form
                    class="stack shelf-position"
                    method="post"
                    action={"/api/prefs/position/" + encodeURIComponent(b.book)}
                  >
                    {hidden("next", "/me/shelf")}
                    <Position
                      chapters={b.chapters}
                      value={
                        b.position === null
                          ? undefined
                          : Math.floor(b.position / 100000)
                      }
                    />
                    <button class="secondary">Save position</button>
                  </form>
                </article>
              ))}
          </div>
          {books.length > 0 && !books.some((b) => b.state === state) && (
            <p class="muted shelf-empty">
              No books here yet. <a href="/books">Find a story →</a>
            </p>
          )}
        </section>
      ))}
    </>,
    { styles: ["me"], modules: ["shelf"] },
  );
});

me.get("/me/favorites", async (c) => {
  const user = reader(c),
    scope = { kind: "favorites" as const, userId: user.id };
  // Recently favorited is the canonical default, including the fragment query.
  if (!c.req.query("sort")) {
    const params = new URLSearchParams(new URL(c.req.url).search);
    params.set("sort", "favorited");
    return c.redirect("/me/favorites?" + params, 303);
  }
  const query = canvasQuery(c);
  if (query.sort === "random" && !c.req.query("seed"))
    return c.redirect(
      "/me/favorites?" + new URLSearchParams(canvasParams(query)),
      303,
    );
  const facets = await canvasFacets(c.env, c.get("prefs"), scope, user.id);
  const v = postVisibilitySql(c.get("prefs"));
  const books = await rows(
    c.env,
    `SELECT DISTINCT b.id,b.title FROM favorites f JOIN posts p ON p.id=f.post JOIN books b ON b.id=p.book WHERE f.user_id=? AND ${v.sql} ORDER BY b.title`,
    user.id,
    ...v.args,
  );
  const link = (sort: string) =>
    "/me/favorites?" + new URLSearchParams({ ...canvasParams(query), sort });
  return page(
    c,
    "Your favorites",
    <>
      <Heading
        title="Pictures worth keeping."
        sub="Artwork you favorited. Only you can see this page."
      />
      <ReaderLinks />
      <div class="favorites-toolbar">
        <Segmented
          label="Sort favorites"
          swap="sort"
          items={[
            ["favorited", "Recently favorited"],
            ["popular", "Popular"],
            ["random", "Random"],
          ].map(([sort, label]) => ({
            label,
            href: link(sort),
            current: query.sort === sort,
          }))}
        />
        <a
          href={
            "/me/favorites?" +
            new URLSearchParams({
              ...canvasParams(query),
              sort: "random",
              seed: crypto.randomUUID(),
            })
          }
          hidden={query.sort !== "random"}
          data-swap-set="seed"
          data-swap-shuffle
        >
          Shuffle again
        </a>
      </div>
      <details
        class="favorites-filters"
        data-filter-sheet="favorites-filter-dialog"
        open={Object.values(query.filters).some(Boolean)}
      >
        <summary>
          Filter your favorites
          <span
            data-swap-active="book style mood character q"
            hidden={!Object.values(query.filters).some(Boolean)}
          >
            {" "}
            · Active
          </span>
        </summary>
        <form
          class="favorites-filter-form"
          method="get"
          action="/me/favorites"
          data-filter-content
          data-swap-form
        >
          {hidden("sort", query.sort)}
          {query.seed && hidden("seed", query.seed)}
          <Picker
            label="Book"
            name="book"
            value={query.filters.book}
            options={[
              { value: "", label: "All books" },
              ...books.map((b) => ({ value: b.id, label: b.title })),
            ]}
          />
          <Picker
            label="Style"
            name="style"
            value={query.filters.style}
            options={[
              { value: "", label: "All styles" },
              ...facets.styles.map((v) => ({ value: v, label: v })),
            ]}
          />
          <Picker
            label="Mood"
            name="mood"
            value={query.filters.mood}
            options={[
              { value: "", label: "All moods" },
              ...facets.moods.map((v) => ({ value: v, label: v })),
            ]}
          />
          <Picker
            label="Character"
            name="character"
            value={query.filters.character}
            options={[
              { value: "", label: "All characters" },
              ...facets.characters.map((v) => ({ value: v.id, label: v.name })),
            ]}
          />
          <label>
            Search favorites
            <input
              type="search"
              name="q"
              maxLength={180}
              value={query.filters.text}
              placeholder="A scene, artist or description…"
            />
          </label>
          <div class="actions">
            <button data-swap-apply>Apply filters</button>
            <a
              href="/me/favorites?sort=favorited"
              data-swap-set="book style mood character q"
            >
              Clear
            </a>
          </div>
        </form>
      </details>
      <Dialog
        id="favorites-filter-dialog"
        title="Filter your favorites"
        mobile="sheet"
      >
        <div data-filter-slot />
      </Dialog>
      {await canvasSection(c, {
        scope,
        label: "Your favorite artwork",
        empty: (
          <EmptyState
            title="Nothing to show here yet"
            icon="heart"
            actions={
              <Button href="/explore" variant="accent">
                Explore artwork
              </Button>
            }
          >
            Favorite a picture to keep it here. Try clearing filters or saving
            book positions on your shelf when spoilers are hidden.
          </EmptyState>
        ),
      })}
    </>,
    { styles: ["canvas", "me", "dialog"] },
  );
});
