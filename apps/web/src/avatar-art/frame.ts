export function frame(id: string) {
  if (id === "frame-paper")
    return `<rect x="6" y="6" width="244" height="244" rx="59" fill="none" stroke="#fff9ee" stroke-width="8"/>`;
  if (id === "frame-starter") return "";
  const c =
    id === "frame-laurel"
      ? "#7a9d88"
      : id === "frame-sun"
        ? "#cf9c54"
        : id === "star-frame"
          ? "#a582c4"
          : "#858dc2";
  const emblem =
    id === "moon-frame"
      ? `<path d="M140 6A17 17 0 1 0 145 34A19 19 0 0 1 140 6Z"/>`
      : id === "frame-sun"
        ? `<circle cx="128" cy="19" r="14"/><path d="M128 0V6M105 19H111M145 19H151M128 33V39"/>`
        : id === "frame-laurel"
          ? `<path d="M107 26Q128 12 149 26" fill="none" stroke-width="3"/><ellipse cx="115" cy="17" rx="5" ry="9" transform="rotate(-35 115 17)"/><ellipse cx="139" cy="17" rx="5" ry="9" transform="rotate(35 139 17)"/>`
          : `<path d="M128 0L134 12 148 15 137 24 139 38 128 31 117 38 119 24 108 15 122 12Z"/>`;
  return `<rect x="7" y="7" width="242" height="242" rx="58" fill="none" stroke="${c}" stroke-width="8"/><g fill="#fff3d4" stroke="${c}" stroke-width="2">${emblem}<circle cx="31" cy="216" r="6"/><circle cx="225" cy="216" r="6"/></g>`;
}
