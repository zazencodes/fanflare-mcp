// Endless scroll for <EndlessLoader>. When the "next page" link nears the viewport, fetch
// its data-fragment URL. The fragment is the next tiles followed by a fresh
// <EndlessLoader> (with the following page's link, or the end message). Tiles go into
// the target container; the loader replaces this one. The link stays the no-script pager.
import { fetchFragment } from "./dom.js";

export function endless(nav) {
  const target = document.getElementById(nav.dataset.endless);
  if (!target) throw new Error("No endless target: " + nav.dataset.endless);
  const link = nav.querySelector("[data-endless-next]");
  if (!link) return;
  let busy = false;
  const observer = new IntersectionObserver(
    (entries) => entries.some((e) => e.isIntersecting) && load(false),
    { rootMargin: "0px 0px 1200px 0px" },
  );
  observer.observe(link);
  link.addEventListener("click", (event) => {
    if (event.ctrlKey || event.metaKey || event.shiftKey) return;
    event.preventDefault();
    load(true);
  });

  async function load(byHand) {
    if (busy) return;
    busy = true;
    nav.classList.add("is-loading");
    nav.classList.remove("is-error");
    try {
      const frag = await fetchFragment(link.dataset.fragment);
      // An in-place sort or filter replaced this loader while the page was loading.
      if (!nav.isConnected) return;
      const nextNav = frag.querySelector("[data-endless]");
      if (!nextNav)
        throw new Error("The fragment must end with an EndlessLoader");
      nextNav.remove();
      const nodes = [...frag.children];
      target.append(...nodes);
      if (target.matches("[data-masonry]")) {
        const { masonry } = await import("./masonry.js");
        masonry(target).append(nodes);
      }
      target.dispatchEvent(
        new CustomEvent("canvas:append", { bubbles: true, detail: { nodes } }),
      );
      observer.disconnect();
      nav.replaceWith(nextNav);
      nextNav.querySelector("[data-endless-status]").textContent =
        nodes.length + " more loaded";
      endless(nextNav);
      if (byHand) nodes[0]?.querySelector("a")?.focus();
    } catch {
      nav.classList.add("is-error");
      nav.querySelector("[data-endless-status]").textContent =
        "More could not be loaded. Use the link to try again.";
      busy = false;
    } finally {
      nav.classList.remove("is-loading");
    }
  }
}
