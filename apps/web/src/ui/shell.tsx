import { Icon, type IconName } from "./icons.tsx";
import { Avatar, Tooltip } from "./components.tsx";
import type { AvatarProfile } from "../images.ts";
import type { Theme } from "../prefs.ts";

/** What the header knows about a signed-in reader. Null fields render neutral states. */
export type ShellViewer = {
  handle: string | null;
  /** The reader's own avatar; null before a handle exists. */
  avatar: AvatarProfile | null;
  displayName: string | null;
  /** Spendable sparks balance; null hides the sparks chip. */
  sparks: number | null;
  level: { number: number; title: string } | null;
  unread: number;
  moderator: boolean;
};

export type ShellState = {
  /** Current path, for active navigation. */
  path: string;
  /** Current path and query, for `next` fields and sign-in returns. */
  here: string;
  /** Prefills the header search on the search page. */
  query: string;
  spoilersHidden: boolean;
  /** The reader's chosen theme; null follows prefers-color-scheme. */
  theme: Theme | null;
  viewer: ShellViewer | null;
};

const number = new Intl.NumberFormat("en");
const startsAt = (path: string, prefix: string) =>
  path === prefix || path.startsWith(prefix + "/");
const signInHref = (here: string) =>
  "/sign-in" + (here === "/" ? "" : "?next=" + encodeURIComponent(here));

const primary: { href: string; label: string; icon: IconName }[] = [
  { href: "/explore", label: "Explore", icon: "compass" },
  { href: "/books", label: "Books", icon: "books" },
  { href: "/leaderboard", label: "Leaderboard", icon: "trophy" },
];

export const spoilerTip = (hidden: boolean) =>
  hidden ? "Spoilers hidden · click to show" : "Spoilers shown · click to hide";

/** The eye switch. A plain form; /js/spoilers.js posts it in place and reloads. */
export function SpoilerSwitch({
  hidden,
  here,
}: {
  hidden: boolean;
  here: string;
}) {
  return (
    <form method="post" action="/api/prefs/spoilers" data-spoiler-switch>
      <input type="hidden" name="hidden" value={hidden ? "0" : "1"} />
      <input type="hidden" name="next" value={here} />
      <Tooltip text={spoilerTip(hidden)}>
        <button
          class="icon-btn spoiler-switch"
          aria-pressed={hidden ? "true" : "false"}
          aria-label="Hide spoilers"
        >
          <Icon name={hidden ? "eye-off" : "eye"} />
        </button>
      </Tooltip>
    </form>
  );
}

/**
 * The theme toggle: a plain form with one button per theme. CSS shows the button for
 * the other theme (it reads data-theme or prefers-color-scheme); /js/theme.js applies
 * the choice in place.
 */
export function ThemeSwitch({ here }: { here: string }) {
  return (
    <form method="post" action="/api/prefs/theme" data-theme-switch>
      <input type="hidden" name="next" value={here} />
      <Tooltip text="Switch to dark theme" class="theme-to-dark">
        <button
          class="icon-btn"
          name="theme"
          value="dark"
          aria-label="Switch to dark theme"
        >
          <Icon name="moon" />
        </button>
      </Tooltip>
      <Tooltip text="Switch to light theme" class="theme-to-light">
        <button
          class="icon-btn"
          name="theme"
          value="light"
          aria-label="Switch to light theme"
        >
          <Icon name="sun" />
        </button>
      </Tooltip>
    </form>
  );
}

export function Bell({ unread }: { unread: number }) {
  const label =
    "Notifications" + (unread ? ", " + number.format(unread) + " unread" : "");
  return (
    <a
      class="icon-btn bell"
      href="/notifications"
      aria-label={label}
      title={label}
    >
      <Icon name="bell" />
      {unread > 0 && (
        <span class="count-badge" aria-hidden="true" data-unread>
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </a>
  );
}

export function SparksChip({
  sparks,
  level,
}: {
  sparks: number;
  level: ShellViewer["level"];
}) {
  return (
    <a
      class="sparks-chip"
      href="/store"
      aria-label={
        number.format(sparks) +
        " sparks" +
        (level ? ", level " + level.number + " " + level.title : "")
      }
      data-sparks
    >
      <Icon name="spark" />
      <span data-sparks-count>{number.format(sparks)}</span>
    </a>
  );
}

/** The account menu body, shared by the desktop dropdown and the mobile Me sheet. */
function AccountMenu({ viewer }: { viewer: ShellViewer }) {
  const link = (href: string, icon: IconName, label: string) => (
    <li>
      <a href={href}>
        <Icon name={icon} />
        {label}
      </a>
    </li>
  );
  return (
    <>
      <div class="menu-head">
        <Avatar profile={viewer.avatar} size="lg" />
        <div>
          <strong>{viewer.displayName ?? "@" + viewer.handle}</strong>
          <span>
            @{viewer.handle}
            {viewer.level &&
              " · Level " + viewer.level.number + " " + viewer.level.title}
          </span>
        </div>
      </div>
      <ul class="menu-list">
        {viewer.handle &&
          link("/u/" + encodeURIComponent(viewer.handle), "user", "Profile")}
        {link("/me/shelf", "shelf", "Shelf")}
        {link("/me/favorites", "heart", "Favorites")}
        {link("/me/avatar", "face", "Avatar")}
        {link("/account", "sliders", "Account")}
        {viewer.moderator && link("/admin", "shield", "Moderator desk")}
        <li class="divider" role="presentation" />
        <li>
          <form method="post" action="/sign-out" data-auth="logout">
            <button type="submit">
              <Icon name="sign-out" />
              Sign out
            </button>
          </form>
        </li>
      </ul>
    </>
  );
}

export function SiteHeader({ state }: { state: ShellState }) {
  const { viewer } = state;
  return (
    <header class="site-header">
      <div class="header-inner">
        <a class="brand" href="/">
          <Icon name="mark" />
          Fanflare
        </a>
        <form
          class="header-search"
          role="search"
          method="get"
          action="/search"
          data-search
        >
          <label class="search-field">
            <Icon name="search" />
            <span class="visually-hidden">Search Fanflare</span>
            <input
              type="search"
              name="q"
              value={state.query}
              placeholder="Search books, characters, scenes…"
              autocomplete="off"
              maxLength={180}
              enterkeyhint="search"
              aria-controls="search-panel"
              data-search-input
            />
          </label>
          <div
            class="search-panel"
            id="search-panel"
            hidden
            data-search-panel
          />
        </form>
        <nav class="header-nav" aria-label="Primary">
          {primary.map((item) => (
            <a
              href={item.href}
              aria-current={
                startsAt(state.path, item.href) ? "page" : undefined
              }
              title={item.label}
            >
              <Icon name={item.icon} />
              <span class="label">{item.label}</span>
            </a>
          ))}
        </nav>
        <div class="header-actions">
          <SpoilerSwitch hidden={state.spoilersHidden} here={state.here} />
          <ThemeSwitch here={state.here} />
          {viewer && <Bell unread={viewer.unread} />}
          {viewer && viewer.sparks !== null && (
            <SparksChip sparks={viewer.sparks} level={viewer.level} />
          )}
          {viewer ? (
            <details class="menu" data-menu>
              <summary class="avatar-btn" aria-label="Your account">
                <Avatar profile={viewer.avatar} size="sm" />
                <Icon name="chevron-down" />
              </summary>
              <div class="menu-panel">
                <AccountMenu viewer={viewer} />
              </div>
            </details>
          ) : (
            <a class="sign-in" href={signInHref(state.here)}>
              Sign in <span aria-hidden="true">↗</span>
            </a>
          )}
        </div>
      </div>
    </header>
  );
}

/** Mobile bottom navigation. Hidden from 768px up. */
export function TabBar({ state }: { state: ShellState }) {
  const { viewer, path } = state;
  const tab = (
    href: string,
    icon: IconName,
    label: string,
    current: boolean,
  ) => (
    <a href={href} aria-current={current ? "page" : undefined}>
      <Icon name={icon} />
      {label}
    </a>
  );
  const mine =
    path === "/account" ||
    path === "/welcome" ||
    (startsAt(path, "/me") && !startsAt(path, "/me/shelf")) ||
    (!!viewer?.handle && startsAt(path, "/u/" + viewer.handle));
  return (
    <nav class="tabbar" aria-label="Sections">
      {tab("/", "home", "Home", path === "/")}
      {tab("/explore", "compass", "Explore", startsAt(path, "/explore"))}
      {tab("/search", "search", "Search", startsAt(path, "/search"))}
      {tab("/me/shelf", "shelf", "Shelf", startsAt(path, "/me/shelf"))}
      {viewer ? (
        <details class={"menu" + (mine ? " is-current" : "")} data-menu>
          <summary aria-label="Me: your account">
            <Avatar profile={viewer.avatar} size="sm" />
            Me
          </summary>
          <div class="menu-panel">
            <AccountMenu viewer={viewer} />
          </div>
        </details>
      ) : (
        <a
          href={signInHref(state.here)}
          aria-current={path === "/sign-in" ? "page" : undefined}
        >
          <Avatar size="sm" />
          Sign in
        </a>
      )}
    </nav>
  );
}

export function SiteFooter() {
  return (
    <footer class="site-footer">
      <div class="footer-inner">
        <a class="brand" href="/">
          <Icon name="mark" />
          Fanflare
        </a>
        <a href="/connect">Connect an agent</a>
        <a href="/blog">Journal</a>
        <a href="/contact">Contact &amp; rights</a>
      </div>
    </footer>
  );
}
