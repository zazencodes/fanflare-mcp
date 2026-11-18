// Entry module on every page. It wires the shell (auth forms, menus, spoiler switch,
// dialogs, shortcuts, toasts) and enhances components present in the markup.
// Page modules import the APIs they need: toast.js, celebrate.js, dialog.js, keys.js,
// masonry.js, endless.js, viewer.js.
import "./auth.js";
import "./instant-search.js";
import "./menus.js";
import "./spoilers.js";
import "./theme.js";
import "./tooltip.js";
import "./dialog.js";
import "./filter-sheet.js";
import "./toast.js";
import "./reward.js";
import "./comments.js";
import { bind } from "./keys.js";
import { enhance as segmented } from "./segmented.js";
import { masonry } from "./masonry.js";

bind("/", () => {
  const field = [...document.querySelectorAll("[data-search-input]")].find(
    (el) => el.checkVisibility(),
  );
  if (!field) return location.assign("/search");
  field.focus();
  field.select();
});

document.querySelectorAll("[data-segmented]").forEach(segmented);
document.querySelectorAll("[data-masonry]").forEach(masonry);

const loaders = document.querySelectorAll("[data-endless]");
if (loaders.length)
  import("./endless.js").then(({ endless }) => loaders.forEach(endless));
if (document.querySelector("[data-swap-region]")) import("./swap.js");
if (document.querySelector("select[data-picker]")) import("./picker.js");

document.addEventListener("click", async (event) => {
  const link = event.target.closest?.(
    "a[data-viewer-item][data-viewer-fragment]",
  );
  if (!link || event.button !== 0) return;
  if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  const scope = link.closest("[data-masonry]") ?? document;
  const items = () => [
    ...scope.querySelectorAll("a[data-viewer-item][data-viewer-fragment]"),
  ];
  const { openViewer } = await import("./viewer.js");
  openViewer({ items, index: items().indexOf(link) });
});
