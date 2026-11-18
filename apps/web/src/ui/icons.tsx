import type { Child } from "hono/jsx";

// One icon set for the whole site: 24px grid, 1.75 stroke, round joins, currentColor.
// Server markup inlines <Icon name="…" />. Browser modules use the inline sprite rendered
// by the shell (<IconSprite />) through `icon(name)` in /js/dom.js.
const paths = {
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.4-4.4" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.75" />
    </>
  ),
  "eye-off": (
    <>
      <path d="M10.4 5.6q.8-.1 1.6-.1c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-2.4 3.3M6.7 6.7C4 8.5 2.5 12 2.5 12s3.5 6.5 9.5 6.5c1.9 0 3.5-.6 4.9-1.5" />
      <path d="M10 10a2.75 2.75 0 0 0 3.9 3.9M3.5 3.5l17 17" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
    </>
  ),
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />,
  bell: (
    <>
      <path d="M6 9.5a6 6 0 0 1 12 0c0 5.5 2.5 7 2.5 7h-17S6 15 6 9.5Z" />
      <path d="M10 20a2.3 2.3 0 0 0 4 0" />
    </>
  ),
  compass: (
    <>
      <circle cx="12" cy="12" r="8.75" />
      <path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" />
    </>
  ),
  books: (
    <>
      <rect x="3.5" y="4" width="4.5" height="16" rx="1" />
      <rect x="10" y="7" width="4.5" height="13" rx="1" />
      <path d="m16.6 8.4 3.3-.9 3 11.3-3.3.9Z" />
    </>
  ),
  trophy: (
    <>
      <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
      <path d="M7 6H4.5A2.5 2.5 0 0 0 7.6 10M17 6h2.5a2.5 2.5 0 0 1-3.1 4M12 14v6.5M8.5 20.5h7" />
    </>
  ),
  home: (
    <path d="M3.5 10.5 12 3.5l8.5 7V19a1.5 1.5 0 0 1-1.5 1.5h-4.5v-6h-5v6H5A1.5 1.5 0 0 1 3.5 19v-8.5Z" />
  ),
  shelf: (
    <>
      <path d="M12 6.5C10 5 7 4.5 3.5 5v13.5c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5Z" />
      <path d="M12 6.5V20" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8.5" r="3.75" />
      <path d="M4.5 20.5c.9-3.8 3.9-6 7.5-6s6.6 2.2 7.5 6" />
    </>
  ),
  spark: (
    <path
      fill="currentColor"
      stroke="none"
      d="M12 2.5c.8 5.4 2.9 7.6 8.5 8.5-5.6.9-7.7 3.1-8.5 8.5-.8-5.4-2.9-7.6-8.5-8.5 5.6-.9 7.7-3.1 8.5-8.5ZM19 15.5c.3 2 1 2.7 3 3-2 .3-2.7 1-3 3-.3-2-1-2.7-3-3 2-.3 2.7-1 3-3Z"
    />
  ),
  heart: (
    <path d="M12 20s-7.5-4.5-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.5 12 20 12 20Z" />
  ),
  upvote: <path d="M12 4 4.5 12.5H9V20h6v-7.5h4.5L12 4Z" />,
  "chevron-down": <path d="m6.5 9.5 5.5 5.5 5.5-5.5" />,
  "chevron-left": <path d="m14.5 18-6-6 6-6" />,
  "chevron-right": <path d="m9.5 18 6-6-6-6" />,
  "arrow-right": <path d="M4.5 12h15M13.5 6l6 6-6 6" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  plus: <path d="M12 5v14M5 12h14" />,
  share: (
    <>
      <path d="M12 15V3.5M7.5 8 12 3.5 16.5 8" />
      <path d="M5 12.5V19a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19v-6.5" />
    </>
  ),
  flag: <path d="M5.5 21V4M5.5 4.5h12l-2.5 4 2.5 4h-12" />,
  image: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m20.5 16-5-5-9.5 8.5" />
    </>
  ),
  "sign-out": (
    <path d="M14.5 4.5h4A1.5 1.5 0 0 1 20 6v12a1.5 1.5 0 0 1-1.5 1.5h-4M10 16.5 5.5 12 10 7.5M5.5 12H15" />
  ),
  sliders: (
    <>
      <path d="M4 7h9.5M18.5 7H20M4 17h3.5M12.5 17H20" />
      <circle cx="16" cy="7" r="2.25" />
      <circle cx="10" cy="17" r="2.25" />
    </>
  ),
  face: (
    <>
      <circle cx="12" cy="12" r="8.75" />
      <path d="M9 10h.01M15 10h.01M8.8 14.2a4 4 0 0 0 6.4 0" />
    </>
  ),
  shield: (
    <path d="M12 3.5 19.5 6v5.5c0 4.5-3.2 7.8-7.5 9-4.3-1.2-7.5-4.5-7.5-9V6L12 3.5Z" />
  ),
  alert: (
    <>
      <circle cx="12" cy="12" r="8.75" />
      <path d="M12 7.5v5.5M12 16.5h.01" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  medal: (
    <>
      <circle cx="12" cy="15" r="5.5" />
      <path d="M8.7 10.6 6 3.5h4l2 4.6 2-4.6h4l-2.7 7.1" />
      <path d="m12 12.6.8 1.6 1.7.3-1.2 1.2.3 1.7-1.6-.8-1.6.8.3-1.7-1.2-1.2 1.7-.3Z" />
    </>
  ),
  mark: (
    <g stroke-width="1.9">
      {Array.from({ length: 12 }, (_, i) => (
        <path d="M12 1.5v21" transform={"rotate(" + i * 15 + " 12 12)"} />
      ))}
    </g>
  ),
} satisfies Record<string, Child>;

export type IconName = keyof typeof paths;

export function Icon({ name, class: cls }: { name: IconName; class?: string }) {
  return (
    <svg
      class={cls}
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths[name]}
    </svg>
  );
}

// Icons the browser modules render (toasts, celebration, viewer, dialogs).
const spriteNames: IconName[] = [
  "eye",
  "eye-off",
  "close",
  "chevron-left",
  "chevron-right",
  "chevron-down",
  "spark",
  "check",
  "alert",
  "medal",
  "heart",
  "upvote",
  "share",
];

export function IconSprite() {
  return (
    <svg width="0" height="0" style="position:absolute" aria-hidden="true">
      {spriteNames.map((name) => (
        <symbol
          id={"i-" + name}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          {paths[name]}
        </symbol>
      ))}
    </svg>
  );
}
