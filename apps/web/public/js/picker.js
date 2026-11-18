// The shared picker menu. Enhances every <Picker> (`label.picker` holding a
// `.picker-label` and a `select[data-picker]`): the native select stays in the form,
// hidden, and a button showing the current value opens a styled listbox. Desktop shows
// it as a popover under the button; mobile as a bottom sheet. Keys: arrows, Home, End,
// Enter or Space to choose, Escape or Tab to close, and type-ahead. Choosing sets the
// select and fires its `change` event, so forms behave exactly as with the native
// control. While an option is active the select fires `picker:preview` with
// `{ value }` (for prefetching); dispatch `picker:sync` on the select after changing its
// value from script.
// With `data-picker-search="/api/…"` the menu starts with a search field: typing fetches
// at most a page of matching <option>s from that endpoint (`?q=`), so a picker can
// choose from thousands of items while the page renders only a few.
import { h, icon, mobile, fragment } from "./dom.js";

let count = 0;

export function picker(select) {
  if (select.dataset.pickerReady) return;
  select.dataset.pickerReady = "1";
  const label = select.closest("label.picker");
  const name = label?.querySelector(".picker-label");
  if (!name)
    throw new Error("A picker select lives in label.picker with .picker-label");
  const id = "picker-" + ++count;
  name.id ||= id + "-label";

  const value = h("span", { class: "picker-value", id: id + "-value" });
  const button = h(
    "button",
    {
      type: "button",
      class: "picker-button",
      "aria-haspopup": "listbox",
      "aria-expanded": "false",
      "aria-controls": id + "-list",
      "aria-labelledby": name.id + " " + value.id,
    },
    value,
    icon("chevron-down"),
  );
  const list = h("ul", {
    class: "picker-list",
    role: "listbox",
    id: id + "-list",
    tabindex: "-1",
    "aria-labelledby": name.id,
  });
  const source = select.dataset.pickerSearch;
  const field =
    source &&
    h("input", {
      type: "search",
      class: "picker-search",
      role: "combobox",
      "aria-label": "Search " + name.textContent.toLowerCase(),
      "aria-controls": list.id,
      "aria-expanded": "true",
      "aria-autocomplete": "list",
      autocomplete: "off",
      enterkeyhint: "search",
      placeholder: "Type to search",
    });
  const status =
    source && h("p", { class: "picker-status", "aria-live": "polite" });
  const panel = h(
    "div",
    { class: "picker-panel", popover: "auto" },
    h("p", { class: "picker-title", "aria-hidden": "true" }, name.textContent),
    field,
    status,
    list,
  );
  select.before(button);
  select.hidden = true;
  select.tabIndex = -1;
  label.after(panel);
  label.classList.add("is-enhanced");

  const options = () => [...list.children];
  let active = -1;
  const show = () => {
    value.textContent = select.selectedOptions[0]?.textContent ?? "";
  };
  show();

  function build() {
    list.replaceChildren(
      ...[...select.options].map((option, i) =>
        h(
          "li",
          {
            role: "option",
            id: id + "-option-" + i,
            "aria-selected": String(option.selected),
            "data-value": option.value,
          },
          h("span", {}, option.textContent),
          icon("check"),
        ),
      ),
    );
  }

  function activate(index, scroll = true) {
    const items = options();
    if (!items.length) return;
    active = Math.max(0, Math.min(items.length - 1, index));
    items.forEach((item, i) =>
      item.classList.toggle("is-active", i === active),
    );
    (field || list).setAttribute("aria-activedescendant", items[active].id);
    if (scroll) items[active].scrollIntoView({ block: "nearest" });
    select.dispatchEvent(
      new CustomEvent("picker:preview", {
        bubbles: true,
        detail: { value: items[active].dataset.value },
      }),
    );
  }

  function position() {
    if (mobile.matches) return panel.removeAttribute("style");
    const r = button.getBoundingClientRect();
    const below = innerHeight - r.bottom - 12;
    const up = below < 240 && r.top > below;
    panel.style.left =
      Math.min(r.left, innerWidth - Math.max(r.width, 240) - 12) + "px";
    panel.style.minWidth = r.width + "px";
    panel.style.top = up ? "auto" : r.bottom + 6 + "px";
    panel.style.bottom = up ? innerHeight - r.top + 6 + "px" : "auto";
    panel.style.maxHeight = Math.max(up ? r.top - 18 : below, 200) + "px";
  }

  function choose(index) {
    const option = select.options[index];
    panel.hidePopover();
    button.focus();
    if (!option || option.selected) return;
    select.value = option.value;
    show();
    select.dispatchEvent(new Event("input", { bubbles: true }));
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }

  button.popoverTargetElement = panel;
  button.addEventListener("keydown", (event) => {
    if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
    event.preventDefault();
    panel.showPopover();
  });
  panel.addEventListener("beforetoggle", (event) => {
    if (event.newState === "open") build();
  });
  panel.addEventListener("toggle", (event) => {
    const open = event.newState === "open";
    button.setAttribute("aria-expanded", String(open));
    if (open) {
      position();
      (field || list).focus({ preventScroll: true });
      activate(select.selectedIndex);
    } else if (panel.contains(document.activeElement)) button.focus();
  });

  let typed = "",
    typedAt = 0;
  function keys(event) {
    const last = options().length - 1;
    const moves = {
      ArrowDown: active + 1,
      ArrowUp: active - 1,
      Home: 0,
      End: last,
      PageDown: active + 8,
      PageUp: active - 8,
    };
    if (event.key in moves) {
      event.preventDefault();
      return activate(moves[event.key]);
    }
    if (event.key === "Enter" || (event.key === " " && !field)) {
      event.preventDefault();
      return choose(active);
    }
    if (event.key === "Escape") {
      event.preventDefault();
      panel.hidePopover();
      return button.focus();
    }
    if (event.key === "Tab") return panel.hidePopover();
    if (
      !field &&
      event.key.length === 1 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      const now = Date.now();
      typed = (now - typedAt > 600 ? "" : typed) + event.key.toLowerCase();
      typedAt = now;
      const items = options();
      const start = typed.length === 1 ? active + 1 : active;
      for (let k = 0; k < items.length; k++) {
        const i = (start + k) % items.length;
        if (items[i].textContent.trim().toLowerCase().startsWith(typed))
          return activate(i);
      }
    }
  }
  list.addEventListener("keydown", keys);
  if (field) {
    field.addEventListener("keydown", keys);
    const initial = [...select.options].map((o) => o.cloneNode(true));
    let timer = 0,
      pending;
    field.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(() => search(field.value.trim()), 180);
    });
    async function search(q) {
      pending?.abort();
      const chosen = select.selectedOptions[0];
      let found = initial.map((o) => o.cloneNode(true));
      status.textContent = "";
      if (q) {
        pending = new AbortController();
        try {
          const r = await fetch(source + "?q=" + encodeURIComponent(q), {
            signal: pending.signal,
            headers: { Accept: "text/html" },
          });
          if (!r.ok) throw new Error("Request failed (" + r.status + ")");
          found = [
            initial[0].cloneNode(true),
            ...fragment(await r.text()).querySelectorAll("option"),
          ];
          if (found.length === 1)
            status.textContent = "Nothing matches “" + q + "”";
        } catch (error) {
          if (error.name === "AbortError") return;
          status.textContent = "These choices could not be loaded. Try again.";
          return;
        }
      }
      // The chosen option always stays, so the form keeps submitting it.
      if (chosen && !found.some((o) => o.value === chosen.value))
        found.splice(1, 0, chosen);
      select.replaceChildren(...found);
      select.value = chosen?.value ?? "";
      build();
      activate(q && found.length > 1 ? 1 : select.selectedIndex);
    }
  }
  list.addEventListener("pointermove", (event) => {
    const item = event.target.closest("[role=option]");
    const index = options().indexOf(item);
    if (index >= 0 && index !== active) activate(index, false);
  });
  list.addEventListener("click", (event) => {
    const item = event.target.closest("[role=option]");
    if (item) choose(options().indexOf(item));
  });
  select.addEventListener("picker:sync", show);
  // A required picker left empty: the hidden select cannot take focus, so open the menu.
  select.addEventListener("invalid", (event) => {
    event.preventDefault();
    button.focus();
    if (!panel.matches(":popover-open")) panel.showPopover();
  });
  select.form?.addEventListener("reset", () => setTimeout(show));
  addEventListener(
    "resize",
    () => panel.matches(":popover-open") && position(),
  );
}

document.querySelectorAll("select[data-picker]").forEach(picker);
