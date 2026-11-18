import type { AvatarProfile } from "./images.ts";
import { Hono } from "hono";
import { type App, page, reader, hidden, keyField } from "./view.tsx";
import {
  publicProfile,
  ownProfile,
  finishWelcome,
  HANDLE_CHANGE_LIMIT,
  type OwnProfile,
} from "./profiles.ts";
import {
  Avatar,
  EmptyState,
  Segmented,
  Dialog,
  Picker,
} from "./ui/components.tsx";
import { canvasSection, canvasQuery, canvasParams } from "./ui/canvas-view.tsx";
import { canvasFacets } from "./canvas.ts";
import { sparksForLevel } from "./sparks.ts";
export function returnPath(value: unknown) {
  return typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\")
    ? value
    : "/explore";
}
const day = (ms: number) =>
  new Date(ms).toLocaleDateString("en", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
function allowanceText({ remaining, nextFree }: OwnProfile["allowance"]) {
  const left =
    remaining === 0
      ? "No handle changes left right now"
      : `${remaining} of ${HANDLE_CHANGE_LIMIT} handle changes left in the last 30 days`;
  return nextFree
    ? `${left}. The next one frees up on ${day(nextFree)}.`
    : left + ".";
}
/** Handle, shown name and visibility; the same controls on /welcome and /account, saved by /api/profile. */
export function ProfileSettings({
  profile,
  next,
  welcome = false,
}: {
  profile: OwnProfile;
  next: string;
  welcome?: boolean;
}) {
  const locked = profile.allowance.remaining === 0;
  return (
    <form
      method="post"
      action="/api/profile"
      class="profile-settings"
      data-profile-form
    >
      {keyField()}
      {hidden("next", next)}
      <label class="profile-handle-field">
        Handle
        <span class="handle-input">
          <span aria-hidden="true">@</span>
          <input
            name="handle"
            required
            minLength={3}
            maxLength={24}
            pattern="[a-z0-9_\-]{3,24}"
            value={profile.handle}
            readonly={locked}
            autoCapitalize="none"
            autocomplete="off"
            spellcheck={false}
            aria-describedby="handle-help handle-allowance"
          />
        </span>
        <small id="handle-help">
          3–24 lowercase letters, numbers, - or _. Your profile lives at
          /u/handle. A handle you leave stays retired, so nobody else can take
          it.
        </small>
        <small id="handle-allowance" data-handle-allowance>
          {allowanceText(profile.allowance)}
        </small>
      </label>
      <fieldset class="profile-choice">
        <legend>Name shown on your art, comments and profile</legend>
        <label class="choice">
          <input
            type="radio"
            name="shown"
            value="pseudonym"
            checked={profile.shown === "pseudonym"}
          />
          <span>
            <strong>{profile.pseudonym}</strong>
            <small>Your pseudonym, chosen for you. It never changes.</small>
          </span>
        </label>
        <label class="choice">
          <input
            type="radio"
            name="shown"
            value="real"
            checked={profile.shown === "real"}
          />
          <span>
            <strong>Your own name</strong>
          </span>
        </label>
        <label class="profile-real-name">
          Name to show
          <input
            name="realName"
            maxLength={60}
            autocomplete="name"
            value={profile.realName ?? profile.authName}
          />
        </label>
      </fieldset>
      <fieldset class="profile-choice">
        <legend>Who can see your profile</legend>
        <label class="choice">
          <input
            type="radio"
            name="private"
            value="0"
            checked={!profile.private}
          />
          <span>
            <strong>Public</strong>
            <small>
              Anyone can open your profile: avatar, level, badges and published
              art. Your name links to it.
            </small>
          </span>
        </label>
        <label class="choice">
          <input
            type="radio"
            name="private"
            value="1"
            checked={profile.private}
          />
          <span>
            <strong>Private</strong>
            <small>
              Others see only your name and avatar. Your name on art, comments
              and leaderboards is not linked, and people search leaves you out.
              You can still upload, vote, comment and earn sparks.
            </small>
          </span>
        </label>
      </fieldset>
      <p class="muted">
        Your email is never shown. Your shelf and favorites are only yours.
      </p>
      <div class="actions">
        <button class="btn accent">
          {welcome ? "Save and continue" : "Save profile"}
        </button>
        {welcome && (
          <button
            class="btn secondary"
            formaction="/welcome"
            formnovalidate
            name="continue"
            value="1"
          >
            Keep these and continue
          </button>
        )}
      </div>
      <p role="status" data-form-status />
    </form>
  );
}
export const profileRoutes = new Hono<App>();
profileRoutes.get("/signed-in", async (c) => {
  const user = reader(c),
    next = returnPath(c.req.query("next"));
  const profile = await ownProfile(c.env, user.id);
  return c.redirect(
    profile.welcomed ? next : "/welcome?next=" + encodeURIComponent(next),
    303,
  );
});
profileRoutes.get("/welcome", async (c) => {
  const profile = await ownProfile(c.env, reader(c).id),
    next = returnPath(c.req.query("next"));
  return page(
    c,
    "Welcome",
    <section class="welcome-page">
      <header class="welcome-identity">
        <Avatar profile={profile} size="xl" label="Your avatar" />
        <div>
          <h1>{profile.displayName}</h1>
          <p class="profile-handle">@{profile.handle}</p>
          <p>
            {profile.shown === "pseudonym"
              ? "We gave you this pseudonym. Readers see it on your art, comments and the leaderboard."
              : "Readers see this name on your art, comments and the leaderboard."}{" "}
            Change anything below, or keep it and continue.
          </p>
        </div>
      </header>
      <ProfileSettings profile={profile} next={next} welcome />
    </section>,
    { styles: ["profile"], modules: ["profile-form"] },
  );
});
profileRoutes.post("/welcome", async (c) => {
  const user = reader(c),
    data = await c.req.formData(),
    next = returnPath(data.get("next"));
  await finishWelcome(c.env, user.id);
  if (c.req.header("Accept")?.includes("application/json"))
    return c.json({ next });
  return c.redirect(next, 303);
});
profileRoutes.get("/u/:handle", async (c) => {
  const p = await publicProfile(c.env, c.req.param("handle")),
    own = c.get("reader")?.id === p.user_id;
  const report = c.get("reader") && !own && (
    <details class="profile-report">
      <summary>Report profile</summary>
      <form method="post" action="/api/report-profile">
        {keyField()}
        {hidden("target", p.user_id)}
        {hidden("next", c.req.path + new URL(c.req.url).search)}
        <label>
          What should the moderators review?
          <textarea name="detail" required maxLength={2000} rows={3} />
        </label>
        <p class="muted">Reports are private to moderators.</p>
        <button class="btn subtle">Send report</button>
      </form>
    </details>
  );
  // A private profile shows others only its shown name and avatar.
  if (p.private && !own)
    return page(
      c,
      p.display_name,
      <section class="profile-hero profile-private">
        <div class="profile-portrait">
          <Avatar profile={p} size="xl" label={p.display_name + "’s avatar"} />
        </div>
        <div class="profile-identity">
          <h1>{p.display_name}</h1>
          <p class="profile-private-note">This profile is private.</p>
          {report}
        </div>
      </section>,
      { styles: ["profile"] },
    );
  const query = canvasQuery(c);
  if (query.sort === "random" && !c.req.query("seed")) {
    const url = new URL(c.req.url);
    url.searchParams.set("seed", query.seed!);
    return c.redirect(url.pathname + url.search, 303);
  }
  const scope = { kind: "owner" as const, userId: p.user_id, handle: p.handle };
  const facets = await canvasFacets(
    c.env,
    c.get("prefs"),
    scope,
    c.get("reader")?.id,
  );
  const profilePath = "/u/" + encodeURIComponent(p.handle);
  const params = canvasParams(query);
  const link = (changes: Record<string, string>) =>
    profilePath + "?" + new URLSearchParams({ ...params, ...changes });
  const clearFilters =
    profilePath +
    "?" +
    new URLSearchParams({
      sort: query.sort,
      ...(query.seed ? { seed: query.seed } : {}),
    });
  const filtered = Object.values(query.filters).some(Boolean);
  const sparks = p.sparks,
    base = sparks ? sparksForLevel(sparks.level) : 0,
    next = sparks ? sparksForLevel(sparks.level + 1) : 1;
  return page(
    c,
    p.display_name,
    <>
      <section class="profile-hero">
        <div class="profile-portrait">
          <Avatar profile={p} size="xl" label={p.display_name + "’s avatar"} />
        </div>
        <div class="profile-identity">
          <h1>{p.display_name}</h1>
          <p class="profile-handle">@{p.handle}</p>
          {own && p.private && (
            <p class="profile-private-note">
              Your profile is private. Others see only your name and avatar.
            </p>
          )}
          <p class="muted">
            Joined{" "}
            {new Date(p.created).toLocaleDateString("en", {
              month: "long",
              year: "numeric",
              timeZone: "UTC",
            })}
          </p>
          {own && (
            <div class="actions">
              <a class="btn subtle" href="/account#profile">
                Edit profile
              </a>
              <a class="btn subtle" href="/me/avatar">
                Dress your companion
              </a>
            </div>
          )}
          {report}
        </div>
        {sparks && (
          <div class="profile-level">
            <span class="eyebrow">Level {sparks.level}</span>
            <h2>{sparks.title}</h2>
            <progress
              value={Math.max(0, sparks.lifetime - base)}
              max={next - base}
              aria-label="Progress to next level"
            />
            <p>
              {sparks.lifetime.toLocaleString()} sparks earned ·{" "}
              {Math.max(0, next - sparks.lifetime).toLocaleString()} to level{" "}
              {sparks.level + 1}
            </p>
            <div class="profile-badges">
              {p.badges.map((b: any) => (
                <span class="chip">
                  ✦ {String(b.badge).replaceAll("-", " ")}
                </span>
              ))}
            </div>
          </div>
        )}
      </section>
      <section class="profile-art">
        <div class="section-heading">
          <h2>Published art</h2>
        </div>
        <div class="profile-toolbar">
          <Segmented
            label="Sort artwork"
            swap="sort"
            items={["recent", "popular", "random"].map((sort) => ({
              label: sort[0].toUpperCase() + sort.slice(1),
              href: link({
                sort,
                ...(sort === "random"
                  ? { seed: query.seed ?? crypto.randomUUID() }
                  : {}),
              }),
              current: query.sort === sort,
            }))}
          />
          <a
            href={link({ seed: crypto.randomUUID() })}
            hidden={query.sort !== "random"}
            data-swap-set="seed"
            data-swap-shuffle
          >
            Shuffle again ↻
          </a>
        </div>
        <details
          class="profile-filters"
          data-filter-sheet="profile-filter-dialog"
          open={filtered}
        >
          <summary>
            Filter artwork
            <span data-swap-active="style mood character q" hidden={!filtered}>
              {" "}
              · Active
            </span>
          </summary>
          <form
            method="get"
            action={profilePath}
            class="profile-filter-form"
            data-filter-content
            data-swap-form
          >
            {hidden("sort", query.sort)}
            {query.seed && hidden("seed", query.seed)}
            {query.filters.book && hidden("book", query.filters.book)}
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
                ...facets.characters.map((v) => ({
                  value: v.id,
                  label: v.name,
                })),
              ]}
            />
            <label class="profile-filter-search">
              Search art
              <input
                name="q"
                value={query.filters.text}
                type="search"
                maxLength={180}
                placeholder="A scene, artist or description…"
              />
            </label>
            <div class="actions">
              <button class="btn accent" data-swap-apply>
                Apply filters
              </button>
              <a href={clearFilters} data-swap-set="style mood character q">
                Clear filters
              </a>
            </div>
          </form>
        </details>
        <Dialog
          id="profile-filter-dialog"
          title="Filter artwork"
          mobile="sheet"
        >
          <div data-filter-slot />
        </Dialog>
        {await canvasSection(c, {
          scope,
          label: p.display_name + "’s published art",
          empty: (
            <EmptyState title="No artwork here">
              No published art matches this view.
            </EmptyState>
          ),
        })}
      </section>
    </>,
    { public: !p.private, styles: ["profile", "canvas", "dialog"] },
  );
});
