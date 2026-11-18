// In-place sorting and filtering for the page's <SwapRegion> (one per page).
//
// The region names its page path, its fragment endpoint and the URL keys it reads. The
// state is those keys in the address bar. Controls change it without navigating:
//   a[data-swap-set="style mood"] sets the listed keys to the values in its href
//                                 (a key missing from the href is cleared); random
//                                 sort always keeps or gains a seed
//   a[data-swap-shuffle]          also gets a fresh seed after every use; hidden unless
//                                 sort is random
//   form[data-swap-form]          a GET form: choosing a select, radio or checkbox applies
//                                 at once; submitting (Enter in a text field) applies too
//   [data-swap-apply]             submit buttons that only exist for no-script pages
//   [data-swap-active="a b"]      shown while any listed key has a value
// Fragments are cached per URL and prefetched on hover, focus and touch (and the sort
// alternatives when the browser is idle), so a switch usually shows at once. The address
// bar follows with history.replaceState, the scroll position stays put, and endless
// scroll continues from the swapped list.
import { fragment as parse } from "./dom.js";
import { endless } from "./endless.js";
import { place } from "./segmented.js";
import { toast } from "./toast.js";

const regions = document.querySelectorAll("[data-swap-region]");
if (regions.length > 1) throw new Error("A page has at most one swap region");
const region = regions[0];
if (region) enhance(region);

function enhance(region) {
  const page = region.dataset.swapRegion;
  const keys = region.dataset.swapKeys.split(" ");
  const cache = new Map(); // fragment URL -> { at, html: Promise<string>, images }
  const TTL = 3 * 60 * 1000;
  let latest = 0;

  const canonical = (state) => {
    const out = new URLSearchParams();
    for (const key of keys) if (state.get(key)) out.set(key, state.get(key));
    return out;
  };
  const current = () => canonical(new URLSearchParams(location.search));
  const pageUrl = (state) => {
    const query = canonical(state).toString();
    return page + (query ? "?" + query : "");
  };
  const fragmentUrl = (state) => {
    const url = new URL(region.dataset.swapFragment, location.origin);
    for (const [key, value] of canonical(state))
      url.searchParams.set(key, value);
    return url.pathname + url.search;
  };
  const seed = () => crypto.randomUUID().replaceAll("-", "").slice(0, 10);

  /** The state a link leads to from `state`. */
  function linkState(link, state = current()) {
    const next = new URLSearchParams(state);
    const href = new URL(link.href, location.href);
    for (const key of link.dataset.swapSet.split(" ")) {
      const value = href.searchParams.get(key);
      if (value) next.set(key, value);
      else next.delete(key);
    }
    // Random order lives in the URL: keep the current seed, or take the link's.
    if (next.get("sort") === "random" && !next.get("seed"))
      next.set("seed", href.searchParams.get("seed") || seed());
    return canonical(next);
  }

  /** The state a form leads to, optionally with one field changed (a picker preview). */
  function formState(form, change) {
    const next = current();
    const data = new FormData(form);
    if (change) data.set(change.name, change.value);
    for (const key of keys)
      if (form.elements.namedItem(key)) next.set(key, data.get(key) ?? "");
    return canonical(next);
  }

  function request(state) {
    const url = fragmentUrl(state);
    const hit = cache.get(url);
    if (hit && Date.now() - hit.at < TTL) return hit.html;
    const html = fetch(url, { headers: { Accept: "text/html" } }).then((r) => {
      if (!r.ok) throw new Error("Request failed (" + r.status + ")");
      return r.text();
    });
    cache.set(url, { at: Date.now(), html });
    html.catch(() => cache.get(url)?.html === html && cache.delete(url));
    return html;
  }

  function prefetch(state, images) {
    if (canonical(state).toString() === current().toString()) return;
    const html = request(state);
    const entry = cache.get(fragmentUrl(state));
    if (!images || entry.images) return;
    entry.images = true;
    html.then(
      (text) => {
        for (const img of [...parse(text).querySelectorAll("img")].slice(0, 8))
          new Image().src = img.getAttribute("src");
      },
      () => {},
    );
  }

  async function go(state, anchor) {
    if (canonical(state).toString() === current().toString()) return;
    const id = ++latest;
    const pending = request(state);
    let settled = false;
    pending.then(
      () => (settled = true),
      () => (settled = true),
    );
    await Promise.resolve();
    if (!settled) {
      region.setAttribute("aria-busy", "true");
      region.classList.add("is-swapping");
    }
    let html;
    try {
      html = await pending;
    } catch {
      if (id !== latest) return;
      region.removeAttribute("aria-busy");
      region.classList.remove("is-swapping");
      toast("That view could not be loaded. Try again.", { tone: "error" });
      return;
    }
    if (id !== latest) return;
    await apply(parse(html), state, anchor);
  }

  async function apply(frag, state, anchor) {
    const loader = frag.querySelector("[data-endless]");
    if (!loader)
      throw new Error("A swap fragment must end with an EndlessLoader");
    loader.remove();
    const summary = frag.querySelector("[data-swap-summary]");
    summary?.remove();
    const nodes = [...frag.children];

    const oldLoader = region.querySelector("[data-endless]");
    const target = document.getElementById(oldLoader.dataset.endless);
    const anchorTop =
      anchor?.isConnected && !anchor.closest("dialog")
        ? anchor.getBoundingClientRect().top
        : null;
    const y = scrollY;
    region.style.minHeight = "";

    if (summary)
      region.querySelector("[data-swap-summary]")?.replaceWith(summary);
    target.replaceChildren(...nodes);
    if (target.matches("[data-masonry]")) {
      const { masonry } = await import("./masonry.js");
      masonry(target).layout();
    }
    const empty = region.querySelector("[data-swap-empty]");
    if (empty) empty.hidden = nodes.length > 0;
    oldLoader.replaceWith(loader);
    endless(loader);

    // Keep the document long enough that the reader's scroll position, and so the
    // toolbar under their eye, does not move when the new list is shorter.
    const lack = y + innerHeight - document.documentElement.scrollHeight;
    if (lack > 0) region.style.minHeight = region.offsetHeight + lack + "px";
    if (scrollY !== y) scrollTo({ top: y, behavior: "instant" });
    if (anchorTop !== null) {
      const drift = anchor.getBoundingClientRect().top - anchorTop;
      if (Math.abs(drift) > 1) scrollBy({ top: drift, behavior: "instant" });
    }

    history.replaceState(history.state, "", pageUrl(state) + location.hash);
    sync(canonical(state));
    region.removeAttribute("aria-busy");
    region.classList.remove("is-swapping");
    region.querySelector("[data-swap-status]").textContent = nodes.length
      ? "List updated"
      : "Nothing matches this view";
    region.dispatchEvent(
      new CustomEvent("swap:update", { bubbles: true, detail: { nodes } }),
    );
  }

  /** Bring every control on the page in line with `state`. */
  function sync(state) {
    for (const link of document.querySelectorAll("a[data-swap-set]")) {
      if (link.matches("[data-swap-shuffle]")) {
        link.hidden = state.get("sort") !== "random";
        link.href = shuffled(state);
        continue;
      }
      link.href = pageUrl(linkState(link, state));
      const own = new URL(link.href, location.href).searchParams;
      const selected = link.dataset.swapSet
        .split(" ")
        .filter((key) => key !== "seed")
        .every((key) => (own.get(key) ?? "") === (state.get(key) ?? ""));
      // Only choices show a current state; actions such as Clear filters do not.
      const value = link.closest("[data-segmented]")
        ? "page"
        : link.matches(".chip") && "true";
      if (!value) continue;
      if (selected) link.setAttribute("aria-current", value);
      else link.removeAttribute("aria-current");
    }
    document.querySelectorAll("[data-segmented]").forEach((control) => {
      if (control.querySelector("a[data-swap-set]")) place(control);
    });
    for (const form of document.querySelectorAll("form[data-swap-form]"))
      for (const field of form.elements) {
        if (!keys.includes(field.name)) continue;
        const value = state.get(field.name) ?? "";
        if (field.type === "radio" || field.type === "checkbox")
          field.checked = field.value === value;
        else if (field !== document.activeElement || field.type === "hidden")
          field.value = value;
        if (field.matches("select"))
          field.dispatchEvent(new Event("picker:sync"));
      }
    for (const el of document.querySelectorAll("[data-swap-active]"))
      el.hidden = !el.dataset.swapActive
        .split(" ")
        .some((key) => state.get(key));
  }

  function shuffled(state) {
    const next = new URLSearchParams(state);
    next.set("seed", seed());
    return pageUrl(next);
  }

  // Choosing applies at once, so the no-script Apply buttons step aside.
  for (const button of document.querySelectorAll("[data-swap-apply]"))
    button.hidden = true;

  const plain = (event) =>
    event.button === 0 &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    !event.altKey;

  document.addEventListener("click", (event) => {
    const link = event.target.closest?.("a[data-swap-set]");
    if (!link || !plain(event)) return;
    event.preventDefault();
    go(linkState(link), link);
  });
  document.addEventListener("submit", (event) => {
    const form = event.target;
    if (form.matches("[data-social-form]")) return cache.clear();
    if (!form.matches("form[data-swap-form]")) return;
    event.preventDefault();
    go(formState(form), form);
  });
  document.addEventListener("change", (event) => {
    const field = event.target;
    const form = field.form;
    if (!form?.matches("[data-swap-form]")) return;
    if (!field.matches("select, [type=radio], [type=checkbox]")) return;
    go(formState(form), form);
  });
  document.addEventListener("fanflare:prefs", () => cache.clear());

  // Prefetch on intent: hover, keyboard focus and the start of a touch.
  const intent = (event) => {
    const link = event.target.closest?.("a[data-swap-set]");
    if (link) return prefetch(linkState(link), true);
    const option = event.target.closest?.("label:has(input[type=radio])");
    const radio = option?.querySelector("input[type=radio]");
    if (radio?.form?.matches("[data-swap-form]"))
      prefetch(formState(radio.form, radio), true);
  };
  document.addEventListener("pointerover", intent);
  document.addEventListener("focusin", intent);
  document.addEventListener("touchstart", intent, { passive: true });
  // Pickers announce the option under the pointer or keyboard before it is chosen.
  document.addEventListener("picker:preview", (event) => {
    const select = event.target;
    if (select.form?.matches("[data-swap-form]"))
      prefetch(
        formState(select.form, {
          name: select.name,
          value: event.detail.value,
        }),
        true,
      );
  });

  // When the browser is idle, warm the other sorts so the first switch is instant.
  (window.requestIdleCallback ?? ((fn) => setTimeout(fn, 1500)))(() => {
    for (const link of document.querySelectorAll(
      "[data-segmented] a[data-swap-set]",
    ))
      prefetch(linkState(link), false);
  });
}
