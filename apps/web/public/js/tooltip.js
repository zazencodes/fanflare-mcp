// Instant tooltips are pure CSS (.has-tooltip > .tooltip). This module only lets Escape
// dismiss the visible tooltip without moving the pointer or focus (WCAG 1.4.13). The
// tooltip returns once the pointer or focus leaves its control.
const dismissed = "tooltip-dismissed";
const host = (node) => node?.closest?.(".has-tooltip") ?? null;
let hovered = null;

document.addEventListener("pointerover", (event) => {
  hovered = host(event.target);
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  hovered?.classList.add(dismissed);
  host(document.activeElement)?.classList.add(dismissed);
});
for (const type of ["pointerout", "focusout"])
  document.addEventListener(type, (event) => {
    const from = host(event.target);
    if (from && !from.contains(event.relatedTarget)) {
      from.classList.remove(dismissed);
      if (type === "pointerout" && from === hovered) hovered = null;
    }
  });
