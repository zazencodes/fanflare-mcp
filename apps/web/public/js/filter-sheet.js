import { mobile } from "./dom.js";
import { openDialog } from "./dialog.js";
// One set of controls: inline details without scripts, shared modal sheet on mobile.
for (const details of document.querySelectorAll("[data-filter-sheet]")) {
  const dialog = document.getElementById(details.dataset.filterSheet);
  const content = details.querySelector("[data-filter-content]");
  const summary = details.querySelector("summary");
  if (mobile.matches) details.open = false;
  summary.addEventListener("click", (event) => {
    if (!mobile.matches) return;
    event.preventDefault();
    details.open = false;
    dialog.querySelector("[data-filter-slot]").append(content);
    openDialog(dialog);
  });
  dialog.addEventListener("close", () => details.append(content));
}
