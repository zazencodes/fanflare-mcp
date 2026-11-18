// The artwork viewer. Desktop: an overlay with the image left, details right, and
// previous/next. Mobile: full screen; swipe sideways for the next artwork, swipe down to
// close, details in a pull-up sheet. The URL follows the artwork (/posts/:id) and Back
// closes the viewer. Clicking the backdrop around the card closes it like Escape and the
// close button.
//
// Tiles opt in with data-viewer-item and data-viewer-fragment="<url>"; app.js opens the
// viewer on click. The fragment URL returns one <ViewerFrame> (ui/components.tsx).
// Events on the viewer dialog (they bubble to document):
//   viewer:open · viewer:change {detail: {frame, item, index}} · viewer:close
// Add keys for the open viewer with pushLayer(bindings, event.target) from keys.js.
import { h, icon, fetchFragment, reducedMotion, mobile } from "./dom.js";
import { pushLayer } from "./keys.js";
import { drag } from "./gestures.js";

function defaultLoad(item) {
  return fetchFragment(item.dataset.viewerFragment);
}

let current = null;

/**
 * Open the viewer. items: anchors (or a function returning them, so tiles appended by
 * endless scroll are included). load(item) resolves to a node containing a ViewerFrame.
 */
export function openViewer({ items, index = 0, load = defaultLoad }) {
  current?.close();
  const list = typeof items === "function" ? items : () => items;
  const title = document.title;
  let navigation = list();
  let at = index,
    seq = 0,
    pushed = false,
    frame = null;

  const stage = h("div", { class: "viewer-stage" });
  const prev = h(
    "button",
    {
      class: "viewer-nav prev",
      type: "button",
      "aria-label": "Previous artwork",
      title: "Previous (k)",
      onclick: () => go(-1),
    },
    icon("chevron-left"),
  );
  const next = h(
    "button",
    {
      class: "viewer-nav next",
      type: "button",
      "aria-label": "Next artwork",
      title: "Next (j)",
      onclick: () => go(1),
    },
    icon("chevron-right"),
  );
  const dialog = h(
    "dialog",
    { class: "viewer", "aria-label": "Artwork viewer" },
    stage,
    h(
      "button",
      {
        class: "viewer-close",
        type: "button",
        "aria-label": "Close viewer",
        title: "Close (Esc)",
        onclick: () => close(),
      },
      icon("close"),
    ),
    prev,
    next,
  );
  document.body.append(dialog);

  async function show(i, direction = 0) {
    const items = navigation;
    if (i < 0 || i >= items.length) return;
    at = i;
    const item = items[i],
      token = ++seq;
    dialog.classList.add("is-loading");
    let node;
    try {
      const loaded = await load(item);
      node = loaded.querySelector?.("[data-viewer-frame]") ?? loaded;
      if (!(node instanceof HTMLElement)) throw new Error("No viewer frame");
    } catch {
      if (token !== seq) return;
      node = h(
        "div",
        { class: "viewer-frame viewer-error" },
        h("p", {}, "This artwork could not be opened here."),
        h("a", { class: "btn secondary", href: item.href }, "Open its page"),
      );
    }
    if (token !== seq) return;
    dialog.classList.remove("is-loading", "is-expanded");
    node.classList.add(
      direction > 0 ? "enter-next" : direction < 0 ? "enter-prev" : "enter",
    );
    const panel = node.querySelector("[data-viewer-panel]");
    panel?.prepend(
      h("button", {
        class: "viewer-handle",
        type: "button",
        "aria-label": "Show details",
        "aria-expanded": "false",
        onclick: (e) =>
          expand(!dialog.classList.contains("is-expanded"), e.currentTarget),
      }),
    );
    if (panel)
      // Pull the collapsed details sheet up; pull it down from the top to collapse (touch).
      drag(panel, {
        axis: "y",
        touch: true,
        end(_, dy, velocity, _axis, cancelled) {
          if (cancelled) return;
          const open = dialog.classList.contains("is-expanded");
          if (!open && (dy < -30 || velocity.y < -0.4)) expand(true);
          else if (
            open &&
            panel.scrollTop <= 0 &&
            (dy > 50 || velocity.y > 0.5)
          )
            expand(false);
        },
      });
    stage.replaceChildren(node);
    frame = node;
    const previousLink = node.querySelector("[data-viewer-previous]");
    const nextLink = node.querySelector("[data-viewer-next]");
    navigation = [previousLink, item, nextLink].filter(Boolean);
    at = previousLink ? 1 : 0;
    prev.disabled = !previousLink;
    next.disabled = !nextLink;
    if (item.href) {
      if (pushed) history.replaceState({ viewer: true }, "", item.href);
      else {
        history.pushState({ viewer: true }, "", item.href);
        pushed = true;
      }
    }
    document.title =
      (node.dataset.title || title.split(" · ")[0]) + " · Fanflare";
    dialog.dispatchEvent(
      new CustomEvent("viewer:change", {
        bubbles: true,
        detail: { frame: node, item, index: i },
      }),
    );
  }

  function expand(open, handle = frame?.querySelector(".viewer-handle")) {
    dialog.classList.toggle("is-expanded", open);
    handle?.setAttribute("aria-expanded", String(open));
    handle?.setAttribute("aria-label", open ? "Hide details" : "Show details");
  }

  async function slideOut(direction) {
    if (!frame || reducedMotion.matches) return;
    frame.style.transition = "transform 160ms ease-in, opacity 160ms ease-in";
    frame.style.transform = `translateX(${direction > 0 ? "-" : ""}40%)`;
    frame.style.opacity = "0";
    await new Promise((r) => setTimeout(r, 150));
  }

  async function go(step) {
    const target = at + step;
    if (target < 0 || target >= navigation.length) return snapBack();
    await slideOut(step);
    await show(target, step);
  }

  function snapBack() {
    if (!frame) return;
    frame.style.transition = "transform 220ms var(--ease-out)";
    frame.style.transform = "";
    dialog.style.removeProperty("--pull");
  }

  const popLayer = pushLayer(
    {
      j: () => go(1),
      k: () => go(-1),
      ArrowRight: () => go(1),
      ArrowLeft: () => go(-1),
      u: () => stage.querySelector('[data-viewer-action="upvote"]')?.click(),
      f: () => stage.querySelector('[data-viewer-action="favorite"]')?.click(),
    },
    dialog,
  );

  function onPop() {
    pushed = false;
    finish();
  }
  window.addEventListener("popstate", onPop);

  function close() {
    if (pushed) history.back();
    else finish();
  }

  async function finish() {
    if (!dialog.open) return;
    window.removeEventListener("popstate", onPop);
    popLayer();
    seq++;
    dialog.classList.add("is-closing");
    if (!reducedMotion.matches) await new Promise((r) => setTimeout(r, 180));
    dialog.close();
    dialog.dispatchEvent(new CustomEvent("viewer:close", { bubbles: true }));
    dialog.remove();
    document.title = title;
    const item =
      list().find((link) => link.href === navigation[at]?.href) ??
      list()[index];
    item?.focus({ preventScroll: true });
    item?.scrollIntoView({ block: "nearest" });
    if (current === controller) current = null;
  }

  // The backdrop: everything outside the card. On mobile the card is the image and its
  // details sheet, so the transparent frame and media area around the image count too.
  // A press that turns into a swipe never closes.
  const backdrop = (target) =>
    target === dialog ||
    target === stage ||
    (mobile.matches &&
      (target === frame ||
        target === frame?.querySelector("[data-viewer-media]")));
  let press = null;
  dialog.addEventListener("pointerdown", (event) => {
    press =
      event.button === 0 && backdrop(event.target)
        ? { x: event.clientX, y: event.clientY }
        : null;
  });
  dialog.addEventListener("click", (event) => {
    const start = press;
    press = null;
    if (
      start &&
      backdrop(event.target) &&
      Math.hypot(event.clientX - start.x, event.clientY - start.y) < 8
    )
      close();
  });

  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    close();
  });

  // Touch gestures on the image: sideways for next or previous, down to close.
  drag(stage, {
    touch: true,
    ignore: "[data-viewer-panel]",
    move(dx, dy, axis) {
      if (!frame) return;
      frame.style.transition = "none";
      if (axis === "x") frame.style.transform = `translateX(${dx}px)`;
      else if (dy > 0) {
        frame.style.transform = `translateY(${dy}px) scale(${1 - Math.min(dy, 400) / 2000})`;
        dialog.style.setProperty("--pull", String(Math.min(1, dy / 400)));
      }
    },
    end(dx, dy, velocity, axis, cancelled) {
      if (cancelled) return snapBack();
      if (
        axis === "x" &&
        (Math.abs(dx) > innerWidth * 0.22 || Math.abs(velocity.x) > 0.5)
      )
        go(dx < 0 ? 1 : -1);
      else if (axis === "y" && (dy > 120 || velocity.y > 0.6)) close();
      else snapBack();
    },
  });
  const controller = {
    close,
    go,
    get index() {
      return at;
    },
    element: dialog,
  };
  current = controller;
  dialog.showModal();
  dialog.dispatchEvent(new CustomEvent("viewer:open", { bubbles: true }));
  show(at);
  return controller;
}
