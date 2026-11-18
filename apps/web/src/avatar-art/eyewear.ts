export function eyewear(id: string) {
  if (id === "eyewear-reading")
    return `<g fill="#fff" fill-opacity=".12" stroke="#74778d" stroke-width="3"><rect x="78" y="101" width="43" height="31" rx="12"/><rect x="135" y="101" width="43" height="31" rx="12"/><path d="M121 113H135M78 108L67 104M178 108L189 104"/></g>`;
  if (id === "eyewear-starter") return "";
  const colour =
    id === "amber-glasses"
      ? "#a96a38"
      : id === "eyewear-rose"
        ? "#b85e85"
        : "#4b4e81";
  if (id === "eyewear-moon")
    return `<g stroke="#7a70a7" stroke-width="5" fill="#fff" fill-opacity=".2"><path d="M78 113H122A22 22 0 0 1 78 113ZM134 113H178A22 22 0 0 1 134 113Z"/><path d="M122 115Q128 109 134 115M78 113L67 107M178 113L189 107" fill="none"/></g>`;
  return `<g stroke="${colour}" stroke-width="5" fill="#fff" fill-opacity=".12"><circle cx="100" cy="115" r="22"/><circle cx="156" cy="115" r="22"/><path d="M122 115Q128 109 134 115M78 111L66 106M178 111L190 106" fill="none"/></g>`;
}
