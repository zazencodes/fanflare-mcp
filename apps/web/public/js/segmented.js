// The sliding pill for segmented controls. Runs on every [data-segmented] on the page;
// call place(control) after changing the selection from script.
const selected = (control) =>
  control.querySelector("a[aria-current]") ??
  control.querySelector("input:checked")?.closest("label");

export function place(control, item = selected(control)) {
  if (!item) return;
  control.style.setProperty("--seg-x", item.offsetLeft + "px");
  control.style.setProperty("--seg-w", item.offsetWidth + "px");
  control.classList.add("is-sliding");
}

export function enhance(control) {
  place(control);
  control.addEventListener("click", (event) => {
    const link = event.target.closest("a");
    if (!link) return;
    control.querySelectorAll("a[aria-current]").forEach((a) => a.removeAttribute("aria-current"));
    link.setAttribute("aria-current", "page");
    place(control, link);
  });
  control.addEventListener("change", () => place(control));
  new ResizeObserver(() => place(control)).observe(control);
}
