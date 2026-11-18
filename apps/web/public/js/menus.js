// Disclosure menus (<details data-menu>): one open at a time, outside click and Escape close.
const menus = () => document.querySelectorAll("details[data-menu]");

document.addEventListener(
  "toggle",
  (event) => {
    const menu = event.target;
    if (!(menu instanceof HTMLDetailsElement) || !menu.matches("[data-menu]"))
      return;
    if (menu.open) for (const other of menus()) if (other !== menu) other.open = false;
  },
  true,
);

document.addEventListener("click", (event) => {
  for (const menu of menus())
    if (menu.open && !menu.contains(event.target)) menu.open = false;
});

document.addEventListener(
  "keydown",
  (event) => {
    if (event.key !== "Escape") return;
    const open = [...menus()].find((m) => m.open);
    if (!open) return;
    open.open = false;
    open.querySelector("summary").focus();
    event.stopImmediatePropagation();
    event.preventDefault();
  },
  true,
);
