import type { z } from "zod";
import type { position } from "@fanflare/contracts";
import type { Child } from "hono/jsx";
import type { Context } from "hono";
import { auth } from "./auth.ts";
import { type Env, first, fail, type Row } from "./common.ts";
import { identifyPrefs, readTheme, type ReaderPrefs } from "./prefs.ts";
import { headerSummary } from "./profiles.ts";
import { IconSprite } from "./ui/icons.tsx";
import {
  type ShellState,
  SiteHeader,
  SiteFooter,
  TabBar,
} from "./ui/shell.tsx";
export type App = {
  Bindings: Env;
  Variables: {
    reader: { id: string; name: string } | null;
    moderator: boolean;
    prefs: ReaderPrefs;
  };
};
export type Web = Context<App>;
export const reader = (c: Web) =>
  c.get("reader") ?? fail("Sign in to continue", 401);
export const moderator = (c: Web) => {
  if (!c.get("moderator")) fail("Moderator access required", 403);
  return reader(c);
};
export async function identify(c: Web) {
  const session = c.req.header("cookie")
    ? await auth(c.env).api.getSession({ headers: c.req.raw.headers })
    : null;
  c.set("reader", session?.user ?? null);
  await identifyPrefs(c);
  c.set(
    "moderator",
    !!(
      session &&
      (await first(
        c.env,
        "SELECT 1 FROM moderators WHERE user_id=?",
        session.user.id,
      ))
    ),
  );
}
/** Browser chrome colour per theme: the brand indigo, and the dark page surface. */
const themeColor = { light: "#5840db", dark: "#0b1424" };
/** Stylesheets in /css/ and modules in /js/, by name. base, shell and app always load. */
export type PageAssets = { styles?: string[]; modules?: string[] };
export async function shellState(c: Web): Promise<ShellState> {
  const user = c.get("reader");
  const summary = user
    ? ((await headerSummary(c.env, user.id)) ??
      fail("Account unavailable", 401))
    : null;
  return {
    path: c.req.path,
    here: c.req.path + new URL(c.req.url).search,
    query: c.req.path === "/search" ? (c.req.query("q") ?? "") : "",
    spoilersHidden: c.get("prefs").spoilersHidden,
    theme: readTheme(c),
    viewer: summary
      ? {
          handle: summary.handle,
          avatar: summary.handle
            ? {
                handle: summary.handle,
                avatar: summary.avatar,
                private: summary.private,
              }
            : null,
          displayName: summary.displayName,
          sparks: summary.studio ? null : summary.balance,
          level:
            summary.level === null || summary.title === null
              ? null
              : { number: summary.level, title: summary.title },
          unread: summary.unreadCount,
          moderator: c.get("moderator"),
        }
      : null,
  };
}
export async function page(
  c: Web,
  title: string,
  children: Child,
  options: {
    public?: boolean;
    path?: string;
    description?: string;
    image?: string;
  } & PageAssets = {},
) {
  const desc =
    options.description ??
    "A reader’s library of illustrations, with scene details matched to your place in the book.";
  const path = options.path ?? c.req.path,
    canonical = c.env.ORIGIN + path;
  const noindex = !options.public || !!c.req.query("through");
  const shell = await shellState(c);
  const styles = [
    ...new Set([
      "base",
      "shell",
      "search",
      "controls",
      ...(options.styles ?? []),
      ...((options.styles ?? []).includes("canvas") ? ["viewer"] : []),
    ]),
  ];
  c.header("Cache-Control", "private, no-store");
  if (noindex) c.header("X-Robots-Tag", "noindex, nofollow");
  return c.html(
    <html lang="en" data-theme={shell.theme ?? undefined}>
      <head>
        <meta charSet="utf-8" />
        <meta
          name="viewport"
          content="width=device-width,initial-scale=1,viewport-fit=cover"
        />
        <title>{title} · Fanflare</title>
        <meta name="description" content={desc} />
        <meta property="og:title" content={title + " · Fanflare"} />
        <meta property="og:description" content={desc} />
        <meta property="og:url" content={canonical} />
        {options.image && (
          <>
            <meta property="og:image" content={options.image} />
            <meta name="twitter:card" content="summary_large_image" />
            <meta name="twitter:image" content={options.image} />
            <meta name="twitter:description" content={desc} />
          </>
        )}
        {options.public && <link rel="canonical" href={canonical} />}
        {noindex && <meta name="robots" content="noindex,nofollow" />}
        <meta name="color-scheme" content={shell.theme ?? "light dark"} />
        {(["light", "dark"] as const).map((theme) => (
          <meta
            name="theme-color"
            content={themeColor[theme]}
            media={
              shell.theme === null
                ? "(prefers-color-scheme: " + theme + ")"
                : shell.theme === theme
                  ? undefined
                  : "not all"
            }
            data-theme-color={theme}
          />
        ))}
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <link
          rel="preload"
          href="/dm.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        {styles.map((name) => (
          <link rel="stylesheet" href={"/css/" + name + ".css"} />
        ))}
        {["app", ...(options.modules ?? [])].map((name) => (
          <script type="module" src={"/js/" + name + ".js"} />
        ))}
      </head>
      <body>
        <a class="skip" href="#main">
          Skip to content
        </a>
        <IconSprite />
        <SiteHeader state={shell} />
        <main id="main" class="page">
          {children}
        </main>
        <SiteFooter />
        <TabBar state={shell} />
        <div class="toasts" id="toasts" popover="manual" aria-live="polite" />
      </body>
    </html>,
  );
}
export function Heading({
  title,
  sub,
  back,
}: {
  title: string;
  sub?: string;
  back?: string;
}) {
  return (
    <div class="heading">
      {back && (
        <a class="back" href={back}>
          ← Back
        </a>
      )}
      <h1>{title}</h1>
      {sub && <p>{sub}</p>}
    </div>
  );
}
export function Position({
  chapters,
  value,
  finished = true,
}: {
  chapters: Row[];
  value?: number | "keep";
  finished?: boolean;
}) {
  return (
    <label>
      Reading position
      <select name="chapter">
        {value === "keep" && (
          <option value="keep" selected>
            Keep the verified passage shown above
          </option>
        )}
        <option value="">Unknown position</option>
        {chapters.map((c) => (
          <option value={c.ord} selected={value === c.ord}>
            {finished ? "Through " : ""}
            {c.label}
          </option>
        ))}
      </select>
    </label>
  );
}
export const hidden = (name: string, value: string | number) => (
  <input type="hidden" name={name} value={value} />
);
export const bookChapters = (c: Web, b: string) =>
  c.env.DB.prepare("SELECT ord,label FROM chapters WHERE book=? ORDER BY ord")
    .bind(b)
    .all<Row>()
    .then((r) => r.results);
export function TextField({
  name,
  label,
  value,
  required = false,
  max = 180,
}: {
  name: string;
  label: string;
  value?: string;
  required?: boolean;
  max?: number;
}) {
  return (
    <label>
      {label}
      <input
        name={name}
        value={value ?? ""}
        required={required}
        maxLength={max}
      />
    </label>
  );
}
export const formText = (data: FormData, k: string) =>
  typeof data.get(k) === "string" ? String(data.get(k)).trim() : "";
export const keyField = () => hidden("request_key", crypto.randomUUID());

export function positionLabel(p: z.infer<typeof position>) {
  switch (p.kind) {
    case "unknown":
      return "Unknown position";
    case "reading":
      return "Start of chapter " + p.chapter;
    case "finished":
      return "End of chapter " + p.chapter;
    case "anchor":
      return "Chapter " + p.chapter + " · " + p.anchor.replaceAll("-", " ");
    case "page":
      return "Page " + p.page + (p.edition_id ? " · " + p.edition_id : "");
  }
}
