import type { Child } from "hono/jsx";
import { Icon, type IconName } from "./icons.tsx";
import { type AvatarProfile, avatarSrc } from "../images.ts";

type Attrs = { [attr: string]: unknown };
const cx = (...names: (string | false | null | undefined)[]) =>
  names.filter(Boolean).join(" ");

/** A link (`href`) or a button. Variants: primary (ink), secondary, accent, quiet. */
export function Button({
  href,
  variant = "primary",
  small = false,
  icon,
  iconEnd,
  class: extra,
  children,
  ...attrs
}: {
  href?: string;
  variant?: "primary" | "secondary" | "accent" | "quiet";
  small?: boolean;
  icon?: IconName;
  iconEnd?: IconName;
  class?: string;
  children?: Child;
} & Attrs) {
  const cls = cx(
    "btn",
    variant !== "primary" && variant,
    small && "small",
    extra,
  );
  const body = (
    <>
      {icon && <Icon name={icon} />}
      {children}
      {iconEnd && <Icon name={iconEnd} />}
    </>
  );
  return href ? (
    <a class={cls} href={href} {...attrs}>
      {body}
    </a>
  ) : (
    <button class={cls} {...attrs}>
      {body}
    </button>
  );
}

/** A round 44px icon button or icon link; `label` is its accessible name. */
export function IconButton({
  href,
  icon,
  label,
  class: extra,
  children,
  ...attrs
}: {
  href?: string;
  icon: IconName;
  label: string;
  class?: string;
  children?: Child;
} & Attrs) {
  const cls = cx("icon-btn", extra);
  return href ? (
    <a class={cls} href={href} aria-label={label} title={label} {...attrs}>
      <Icon name={icon} />
      {children}
    </a>
  ) : (
    <button class={cls} aria-label={label} title={label} {...attrs}>
      <Icon name={icon} />
      {children}
    </button>
  );
}

/** A pill for filters and suggestions. Links mark `current`; buttons mark `pressed`. */
export function Chip({
  href,
  current,
  pressed,
  icon,
  count,
  children,
  ...attrs
}: {
  href?: string;
  current?: boolean;
  pressed?: boolean;
  icon?: IconName;
  count?: number;
  children: Child;
} & Attrs) {
  const body = (
    <>
      {icon && <Icon name={icon} />}
      {children}
      {count !== undefined && <span class="count">{count}</span>}
    </>
  );
  return href ? (
    <a
      class="chip"
      href={href}
      aria-current={current ? "true" : undefined}
      {...attrs}
    >
      {body}
    </a>
  ) : (
    <button
      class="chip"
      type="button"
      aria-pressed={pressed ? "true" : "false"}
      {...attrs}
    >
      {body}
    </button>
  );
}

type LinkSegment = {
  label: string;
  href: string;
  current?: boolean;
  icon?: IconName;
};
type RadioSegment = {
  label: string;
  value: string;
  checked?: boolean;
  icon?: IconName;
};

/**
 * A segmented control. With `items` of links it navigates (works without JavaScript);
 * with `name` and radio items it is a form field. /js/segmented.js adds the sliding pill.
 * `swap` names the URL keys the links set in the page's in-place region (/js/swap.js).
 */
export function Segmented(
  props:
    | { label: string; items: LinkSegment[]; name?: undefined; swap?: string }
    | { label: string; name: string; items: RadioSegment[] },
) {
  if (props.name === undefined)
    return (
      <nav class="segmented" aria-label={props.label} data-segmented>
        {props.items.map((item) => (
          <a
            href={item.href}
            aria-current={item.current ? "page" : undefined}
            data-swap-set={props.swap}
          >
            {item.icon && <Icon name={item.icon} />}
            {item.label}
          </a>
        ))}
      </nav>
    );
  return (
    <fieldset class="segmented" data-segmented>
      <legend>{props.label}</legend>
      {props.items.map((item) => (
        <label>
          <input
            type="radio"
            name={props.name}
            value={item.value}
            checked={item.checked}
          />
          {item.icon && <Icon name={item.icon} />}
          {item.label}
        </label>
      ))}
    </fieldset>
  );
}

export type PickerOption = { value: string; label: string };

/**
 * A labelled choice from a list. Renders a native select (it submits with its form and
 * is the no-script control); /js/picker.js replaces its popup with the shared styled
 * listbox (a bottom sheet on mobile). Labels are shown exactly as stored.
 */
export function Picker({
  label,
  name,
  value = "",
  options,
  class: extra,
  ...attrs
}: {
  label: string;
  name: string;
  value?: string;
  options: PickerOption[];
  /** Extra classes for the label (the picker's layout box). */
  class?: string;
} & Attrs) {
  return (
    <label class={extra ? "picker " + extra : "picker"}>
      <span class="picker-label">{label}</span>
      <select name={name} data-picker {...attrs}>
        {options.map((option) => (
          <option value={option.value} selected={option.value === value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** A book cover in a reserved 2:3 frame. `src` comes from the catalog's cover URL helper. */
export function Cover({
  src,
  title,
  size = "md",
  href,
  decorative = false,
  eager = false,
}: {
  src: string;
  title: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "fill";
  href?: string;
  decorative?: boolean;
  eager?: boolean;
}) {
  const img = (
    <img
      src={src}
      alt={decorative ? "" : "Cover of " + title}
      width="400"
      height="600"
      loading={eager ? "eager" : "lazy"}
      decoding="async"
    />
  );
  const cls = cx("cover", size !== "md" && size);
  return href ? (
    <a class={cls} href={href}>
      {img}
    </a>
  ) : (
    <span class={cls}>{img}</span>
  );
}

/** A reader's avatar (public URL, or inline for a private profile), or a neutral glyph before a handle exists. */
export function Avatar({
  profile,
  size = "md",
  label,
}: {
  profile?: AvatarProfile | null;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  label?: string;
}) {
  const cls = cx("avatar", size !== "md" && size);
  return profile ? (
    <span class={cls}>
      <img
        src={avatarSrc(profile)}
        data-avatar={profile.handle}
        alt={label ?? ""}
        width="128"
        height="128"
        loading="lazy"
        decoding="async"
      />
    </span>
  ) : (
    <span class={cls} role={label ? "img" : undefined} aria-label={label}>
      <Icon name="user" />
    </span>
  );
}

/** Empty or error state with an optional action row. */
export function EmptyState({
  title,
  icon = "image",
  tone,
  level = 3,
  actions,
  children,
}: {
  title: string;
  icon?: IconName;
  tone?: "error";
  level?: 2 | 3;
  actions?: Child;
  children?: Child;
}) {
  const H = level === 2 ? "h2" : "h3";
  return (
    <div
      class={cx("empty", tone)}
      role={tone === "error" ? "alert" : undefined}
    >
      <span class="empty-mark" aria-hidden="true">
        <Icon name={tone === "error" ? "alert" : icon} />
      </span>
      <H>{title}</H>
      {children && <p>{children}</p>}
      {actions && <div class="actions">{actions}</div>}
    </div>
  );
}

/**
 * A modal overlay on desktop that becomes a bottom sheet (or a full screen) on mobile.
 * Open with a trigger carrying `data-dialog-open="<id>"` (use a link with a no-script
 * fallback href). Close buttons use the native `<form method="dialog">`.
 */
export function Dialog({
  id,
  title,
  size = "md",
  mobile = "sheet",
  footer,
  children,
}: {
  id: string;
  title: string;
  size?: "sm" | "md" | "lg";
  mobile?: "sheet" | "full";
  footer?: Child;
  children: Child;
}) {
  return (
    <dialog
      id={id}
      class={cx(
        "dialog",
        size,
        mobile === "full" ? "full-mobile" : "sheet-mobile",
      )}
      aria-labelledby={id + "-title"}
      data-dialog
    >
      <div class="dialog-head">
        <span class="sheet-handle" aria-hidden="true" data-sheet-handle />
        <h2 id={id + "-title"}>{title}</h2>
        <form method="dialog">
          <button class="icon-btn" aria-label="Close" title="Close">
            <Icon name="close" />
          </button>
        </form>
      </div>
      <div class="dialog-body">{children}</div>
      {footer && <div class="dialog-foot">{footer}</div>}
    </dialog>
  );
}

/**
 * The artwork viewer's two regions. Permalink pages render it as a page; the viewer
 * fragment endpoint returns exactly this markup and /js/viewer.js slots it into the overlay.
 */
export function ViewerFrame({
  media,
  panel,
  title,
}: {
  media: Child;
  panel: Child;
  title: string;
}) {
  return (
    <div class="viewer-frame" data-viewer-frame data-title={title}>
      <figure class="viewer-media" data-viewer-media>
        {media}
      </figure>
      <section
        class="viewer-panel"
        aria-label="Artwork details"
        data-viewer-panel
      >
        {panel}
      </section>
    </div>
  );
}

/**
 * An instant tooltip below its control, shown on hover and keyboard focus. It is visual
 * only: the control's own aria-label (and aria-pressed) carries the same words.
 * `align="end"` anchors it to the control's right edge near the viewport edge.
 */
export function Tooltip({
  text,
  align,
  class: extra,
  children,
}: {
  text: string;
  align?: "end";
  class?: string;
  children: Child;
}) {
  return (
    <span class={cx("has-tooltip", extra)}>
      {children}
      <span class={cx("tooltip", align)} aria-hidden="true" data-tooltip>
        {text}
      </span>
    </span>
  );
}
