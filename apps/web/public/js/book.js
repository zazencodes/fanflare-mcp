import "./comments.js";
import { mobile } from "./dom.js";
const hero = document.querySelector(".book-hero");
if (hero)
  new IntersectionObserver(
    ([entry]) =>
      document
        .querySelector(".book-page")
        .classList.toggle("is-scrolled", !entry.isIntersecting),
    { rootMargin: "-68px 0px 0px" },
  ).observe(hero);
const fresh = new URL(location.href).searchParams.get("published");
if (fresh) {
  const url = new URL(location.href);
  url.searchParams.delete("published");
  history.replaceState(history.state, "", url.pathname + url.search + url.hash);
  document
    .querySelectorAll("[data-post]")
    .forEach((tile) =>
      tile.classList.toggle("is-fresh", tile.dataset.post === fresh),
    );
}

function revealContextAnchor() {
  const target = document.getElementById(
    decodeURIComponent(location.hash.slice(1)),
  );
  const section = target?.closest(".book-context details");
  if (section) {
    section.open = true;
    requestAnimationFrame(() => target.scrollIntoView({ block: "start" }));
  }
}
revealContextAnchor();
addEventListener("hashchange", revealContextAnchor);

// The floating action yields to visible forms; no-script pages keep it in the header.
const bookPage = document.querySelector(".book-page");
const share = bookPage?.querySelector(".share-artwork");
if (share) {
  bookPage.classList.add("fab-ready");
  let frame = 0;
  const update = () => {
    frame = 0;
    const fab = share.getBoundingClientRect();
    const overlaps =
      mobile.matches &&
      [...bookPage.querySelectorAll("form")].some((form) => {
        if (!form.checkVisibility()) return false;
        const r = form.getBoundingClientRect();
        return (
          r.width > 0 &&
          r.height > 0 &&
          r.left < fab.right &&
          r.right > fab.left &&
          r.top < fab.bottom &&
          r.bottom > fab.top
        );
      });
    bookPage.classList.toggle("fab-yielding", overlaps);
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };
  addEventListener("scroll", schedule, { passive: true });
  addEventListener("resize", schedule);
  visualViewport?.addEventListener("resize", schedule);
  visualViewport?.addEventListener("scroll", schedule);
  update();
}
