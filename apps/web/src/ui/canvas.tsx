import type { Child } from "hono/jsx";
import { Icon } from "./icons.tsx";
import { Avatar } from "./components.tsx";
import type { AvatarProfile } from "../images.ts";

/**
 * The masonry canvas. Children are <ArtworkTile>s in reading order (newest first).
 * Without JavaScript it is an ordered uniform grid; /js/masonry.js places tiles into the
 * shortest column so the order runs left to right, top to bottom, first tile top left.
 */
export function Canvas({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: Child;
}) {
  return (
    <section class="canvas" id={id} aria-label={label} data-masonry>
      {children}
    </section>
  );
}

export type TileArtist = {
  /** The approved public credit, or the reader's display name. */
  name: string;
  /** The artist's profile, for the avatar and profile link. A private profile keeps its avatar but is not linked. */
  profile?: AvatarProfile | null;
};

/** One artwork on a canvas. Width and height are the stored image dimensions. */
export function ArtworkTile({
  id,
  href,
  src,
  width,
  height,
  alt,
  artist,
  upvotes,
  favorite,
  next,
  fragment,
  fresh = false,
}: {
  id: string;
  href: string;
  src: string;
  width: number;
  height: number;
  alt: string;
  artist: TileArtist;
  /** `action` renders a toggle form (signed-in readers); otherwise the count only. */
  upvotes: {
    count: number;
    pressed?: boolean;
    action?: string;
    disabled?: boolean;
  };
  /** Present for signed-in readers. */
  favorite?: { pressed: boolean; action: string };
  /** Same-origin path the toggle forms return to without JavaScript. */
  next?: string;
  /** HTML fragment URL that /js/viewer.js loads to open this artwork in place. */
  fragment?: string;
  /** Highlights a tile that was just inserted (for example after publishing). */
  fresh?: boolean;
}) {
  const name =
    artist.profile && !artist.profile.private ? (
      <a
        class="tile-artist"
        href={"/u/" + encodeURIComponent(artist.profile.handle)}
      >
        <Avatar profile={artist.profile} size="xs" />
        <span>{artist.name}</span>
      </a>
    ) : (
      <span class="tile-artist">
        <Avatar profile={artist.profile} size="xs" />
        <span>{artist.name}</span>
      </span>
    );
  const votes = upvotes.count + (upvotes.count === 1 ? " upvote" : " upvotes");
  return (
    <article
      class={"tile" + (fresh ? " is-fresh" : "")}
      data-tile
      data-post={id}
      style={"--tile-ratio:" + width + "/" + height}
    >
      <a
        class="tile-media"
        href={href}
        data-viewer-item
        data-viewer-fragment={fragment}
      >
        <img
          src={src}
          alt={alt}
          width={width}
          height={height}
          loading="lazy"
          decoding="async"
        />
      </a>
      <div class="tile-meta">
        {name}
        <div class="tile-actions">
          {upvotes.action ? (
            <form
              method="post"
              action={upvotes.action}
              data-tile-action="upvote"
              data-social-form
              data-toggle="upvote"
            >
              <input
                type="hidden"
                name="request_key"
                value={crypto.randomUUID()}
              />
              <input type="hidden" name="post" value={id} />
              <input
                type="hidden"
                name="active"
                value={upvotes.pressed ? "false" : "true"}
              />
              {next && <input type="hidden" name="next" value={next} />}
              <button
                class="tile-btn"
                disabled={upvotes.disabled}
                title={
                  upvotes.disabled
                    ? "You cannot upvote your own artwork"
                    : undefined
                }
                aria-pressed={upvotes.pressed ? "true" : "false"}
                aria-label={"Upvote · " + votes}
              >
                <Icon name="upvote" />
                <span data-count>{upvotes.count}</span>
              </button>
            </form>
          ) : (
            <span class="tile-btn" aria-label={votes} role="img">
              <Icon name="upvote" />
              <span data-count>{upvotes.count}</span>
            </span>
          )}
          {favorite && (
            <form
              method="post"
              action={favorite.action}
              data-tile-action="favorite"
              data-social-form
              data-toggle="favorite"
            >
              <input
                type="hidden"
                name="request_key"
                value={crypto.randomUUID()}
              />
              <input type="hidden" name="post" value={id} />
              <input
                type="hidden"
                name="active"
                value={favorite.pressed ? "false" : "true"}
              />
              {next && <input type="hidden" name="next" value={next} />}
              <button
                class="tile-btn fav"
                aria-pressed={favorite.pressed ? "true" : "false"}
                aria-label="Favorite"
              >
                <Icon name="heart" />
              </button>
            </form>
          )}
        </div>
      </div>
    </article>
  );
}

/**
 * Endless scroll. The link is the no-script pager; /js/endless.js fetches `fragment`
 * when the link nears the viewport and appends the returned tiles to `target`.
 */
export function EndlessLoader({
  target,
  next,
  label = "More artwork",
  end = "You have reached the end.",
}: {
  target: string;
  next?: { href: string; fragment: string };
  label?: string;
  end?: string;
}) {
  return (
    <nav class="endless" aria-label="More results" data-endless={target}>
      {next ? (
        <a
          class="btn secondary"
          href={next.href}
          rel="next"
          data-endless-next
          data-fragment={next.fragment}
        >
          {label}
        </a>
      ) : (
        <p class="endless-end">{end}</p>
      )}
      <span class="endless-spinner" aria-hidden="true" />
      <span class="visually-hidden" aria-live="polite" data-endless-status />
    </nav>
  );
}

/**
 * A list that sorts and filters in place. /js/swap.js turns controls marked
 * `data-swap-set` (links) and `data-swap-form` (GET forms) into requests for
 * `fragment` plus the region's `keys`, replaces the list and its EndlessLoader, and
 * keeps the address bar on `page` with the same parameters. The fragment is the first
 * page of items followed by an EndlessLoader, optionally preceded by a
 * `[data-swap-summary]` that replaces the region's own. `empty` is shown whenever the
 * list has no items. Without JavaScript the same controls navigate to `page`.
 */
export function SwapRegion({
  page,
  fragment,
  keys,
  empty,
  blank,
  children,
}: {
  page: string;
  fragment: string;
  keys: string[];
  empty?: Child;
  blank: boolean;
  children: Child;
}) {
  return (
    <div
      class="swap-region"
      data-swap-region={page}
      data-swap-fragment={fragment}
      data-swap-keys={keys.join(" ")}
    >
      {empty && (
        <div data-swap-empty hidden={!blank}>
          {empty}
        </div>
      )}
      {children}
      <p class="visually-hidden" aria-live="polite" data-swap-status />
    </div>
  );
}
