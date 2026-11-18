// Small DOM helpers shared by the browser modules.
const SVG = "http://www.w3.org/2000/svg";

export const mobile = matchMedia("(max-width: 767.98px)");
export const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

/** An icon from the shell's inline sprite (names match apps/web/src/ui/icons.tsx). */
export function icon(name) {
  const svg = document.createElementNS(SVG, "svg");
  for (const [k, v] of Object.entries({
    viewBox: "0 0 24 24",
    width: "24",
    height: "24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "1.75",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
    focusable: "false",
  }))
    svg.setAttribute(k, v);
  const use = document.createElementNS(SVG, "use");
  use.setAttribute("href", "#i-" + name);
  svg.append(use);
  return svg;
}

/** Create an element: h("button", { class: "btn", onclick: fn }, "Label"). */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  el.append(...children.flat().filter((c) => c != null && c !== false));
  return el;
}

/** Parse same-origin server HTML into a fragment. */
export function fragment(html) {
  const t = document.createElement("template");
  t.innerHTML = html;
  return t.content;
}

/** Fetch a same-origin HTML fragment; fails loudly on a non-2xx response. */
export async function fetchFragment(url, init = {}) {
  const r = await fetch(url, {
    ...init,
    headers: { Accept: "text/html", ...init.headers },
  });
  if (!r.ok) throw new Error("Request failed (" + r.status + ")");
  return fragment(await r.text());
}

/** Resolve after an element's animation ends (immediately with reduced motion). */
export function afterAnimation(el, ms = 400) {
  if (reducedMotion.matches) return Promise.resolve();
  return new Promise((done) => {
    const finish = () => {
      clearTimeout(timer);
      el.removeEventListener("animationend", finish);
      done();
    };
    const timer = setTimeout(finish, ms);
    el.addEventListener("animationend", finish);
  });
}
