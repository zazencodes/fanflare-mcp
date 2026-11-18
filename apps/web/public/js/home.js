import { place } from "./segmented.js";
import { masonry } from "./masonry.js";
const tabs = [...document.querySelectorAll("[data-list-tab]")];
for (const tab of tabs)
  tab.addEventListener("click", () => {
    for (const button of tabs)
      button.setAttribute("aria-pressed", String(button === tab));
    for (const panel of document.querySelectorAll("[data-list-panel]"))
      panel.dataset.listActive = String(
        panel.dataset.listPanel === tab.dataset.listTab,
      );
  });
document.documentElement.classList.add("home-enhanced");

// Fresh from readers: both lists are already on the page, so Recent and Trending switch
// without a request or any scroll movement. The links remain the no-script path.
const freshTabs = document.querySelector("[data-fresh-tabs]");
const freshPanels = [...document.querySelectorAll("[data-fresh-panel]")];
const freshSort = (link) => new URL(link.href).searchParams.get("sort");
const warm = (panel) =>
  panel
    .querySelectorAll("img[loading=lazy]")
    .forEach((img) => (img.loading = "eager"));
if (freshTabs) {
  const control = freshTabs.querySelector("[data-segmented]");
  freshTabs.addEventListener("click", (event) => {
    const link = event.target.closest("a");
    if (!link || event.button !== 0) return;
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)
      return;
    event.preventDefault();
    const sort = freshSort(link);
    for (const a of control.querySelectorAll("a"))
      if (a === link) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    place(control, link);
    for (const panel of freshPanels) {
      panel.hidden = panel.dataset.freshPanel !== sort;
      const canvas = panel.querySelector("[data-masonry]");
      if (!panel.hidden && canvas) masonry(canvas).layout();
    }
    const url = new URL(location.href);
    url.searchParams.set("sort", sort);
    url.hash = "";
    history.replaceState(history.state, "", url.pathname + url.search);
  });
  // Load the hidden list's thumbnails once the page is idle.
  (window.requestIdleCallback ?? ((fn) => setTimeout(fn, 1500)))(() =>
    freshPanels.filter((panel) => panel.hidden).forEach(warm),
  );
}
