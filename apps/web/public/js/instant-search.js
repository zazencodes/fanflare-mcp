// Each GET /search form owns a [data-search-input] and [data-search-panel].
// Results are server-rendered and spoiler-filtered; this module only navigates them.
const searches = [];
let nextId = 0;

function enhance(input) {
  const form = input.form;
  const panel = form?.querySelector("[data-search-panel]");
  if (!panel) throw new Error("Search input requires a panel in its form");
  form.classList.add("instant-search");
  panel.classList.add("search-panel");
  panel.id ||= `search-panel-${++nextId}`;
  panel.setAttribute("role", "listbox");
  panel.setAttribute("aria-label", "Search suggestions");
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-controls", panel.id);
  input.setAttribute("aria-expanded", "false");
  input.setAttribute("autocomplete", "off");
  const status = document.createElement("span");
  status.className = "visually-hidden";
  status.setAttribute("role", "status");
  form.append(status);
  let timer,
    controller,
    revision = 0,
    selected = -1,
    links = [];
  const select = (index) => {
    selected = index;
    links.forEach((link, i) =>
      link.setAttribute("aria-selected", String(i === index)),
    );
    if (index < 0) input.removeAttribute("aria-activedescendant");
    else {
      input.setAttribute("aria-activedescendant", links[index].id);
      links[index].scrollIntoView({ block: "nearest" });
    }
  };
  function close() {
    clearTimeout(timer);
    timer = undefined;
    controller?.abort();
    controller = undefined;
    revision++;
    panel.hidden = true;
    input.setAttribute("aria-expanded", "false");
    select(-1);
    status.textContent = "";
  }
  searches.push({ form, close });
  function prepare() {
    links = [...panel.querySelectorAll("[data-search-result]")];
    links.forEach((link, i) => {
      link.id = `${panel.id}-option-${i}`;
      link.setAttribute("role", "option");
      link.tabIndex = -1;
    });
    panel
      .querySelectorAll("[data-search-group]")
      .forEach((group) => group.setAttribute("role", "group"));
    select(-1);
    panel.hidden = false;
    input.setAttribute("aria-expanded", "true");
    status.textContent = `${links.length} suggestions. Use the arrow keys to choose a result.`;
  }
  async function load(token, q) {
    const requestController = new AbortController();
    controller = requestController;
    try {
      const response = await fetch(
        `/api/search/suggest?${new URLSearchParams({ q })}`,
        {
          signal: requestController.signal,
          headers: { Accept: "text/html" },
        },
      );
      if (!response.ok) throw new Error("Suggestions unavailable");
      const html = await response.text();
      if (token !== revision || document.activeElement !== input) return;
      panel.innerHTML = html;
      prepare();
    } catch (error) {
      if (error.name === "AbortError" || token !== revision) return;
      const message = document.createElement("p");
      message.className = "search-hint";
      message.textContent =
        "Suggestions are unavailable. Press Enter to search.";
      panel.replaceChildren(message);
      prepare();
      status.textContent = message.textContent;
    } finally {
      if (controller === requestController) controller = undefined;
    }
  }
  function schedule(delay) {
    close();
    const q = input.value.trim();
    if (q.length < 2 || input.matches(":disabled")) return;
    const token = revision;
    timer = setTimeout(() => {
      timer = undefined;
      load(token, q);
    }, delay);
  }
  input.addEventListener("input", (event) => {
    if (!event.isComposing) schedule(180);
  });
  input.addEventListener("compositionstart", close);
  input.addEventListener("compositionend", () => schedule(180));
  input.addEventListener("focus", () => schedule(0));
  input.addEventListener("keydown", (event) => {
    if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey)
      return;
    if (event.key === "Escape") {
      if (!panel.hidden || timer || controller) {
        event.preventDefault();
        event.stopPropagation();
        close();
      }
      return;
    }
    if (event.key === "Enter" && !panel.hidden && selected >= 0) {
      event.preventDefault();
      location.assign(links[selected].href);
      return;
    }
    if (
      !panel.hidden &&
      links.length &&
      ["ArrowDown", "ArrowUp"].includes(event.key)
    ) {
      event.preventDefault();
      const index =
        selected < 0
          ? event.key === "ArrowDown"
            ? 0
            : links.length - 1
          : (selected + (event.key === "ArrowDown" ? 1 : -1) + links.length) %
            links.length;
      select(index);
    }
  });
  form.addEventListener("focusout", (event) => {
    if (!form.contains(event.relatedTarget)) close();
  });
  form.addEventListener("submit", close);
}

document.querySelectorAll("[data-search-input]").forEach(enhance);
document.addEventListener("pointerdown", (event) => {
  searches.forEach(({ form, close }) => {
    if (!form.contains(event.target)) close();
  });
});
window.addEventListener("pageshow", () =>
  searches.forEach((search) => search.close()),
);
