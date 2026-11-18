// Celebration overlay for a level-up or a new badge. Calls queue and show one at a time.
//   celebrate({ kind: "level", level: 5, title: "Page Turner", detail: "…" })
//   celebrate({ kind: "badge", title: "First Light", detail: "Your first published art." })
// Resolves when the reader dismisses it.
import { h, icon, reducedMotion } from "./dom.js";

const colours = ["#ffbc78", "#ff9bd1", "#ac79fa", "#81a1fa", "#84edee", "#fff1b4"];
let queue = Promise.resolve();

function show({ kind, level, title, detail, action = "Keep going" }) {
  const id = "celebration-" + Math.random().toString(36).slice(2);
  const burst = h("span", { class: "celebration-burst", "aria-hidden": "true" });
  if (!reducedMotion.matches)
    for (let i = 0; i < 18; i++) {
      const bit = h("i");
      bit.style.setProperty("--a", i * 20 + (i % 2) * 8 + "deg");
      bit.style.setProperty("--d", (i % 3) * 70 + "ms");
      bit.style.setProperty("--c", colours[i % colours.length]);
      burst.append(bit);
    }
  const medal = h(
    "div",
    { class: "celebration-medal", "aria-hidden": "true" },
    kind === "level" ? h("span", { class: "serif" }, String(level)) : icon("medal"),
    burst,
  );
  const dialog = h(
    "dialog",
    {
      class: "celebration",
      "aria-labelledby": id,
      "aria-describedby": detail ? id + "-detail" : null,
    },
    medal,
    h(
      "span",
      { class: "celebration-kicker" },
      kind === "level" ? "Level " + level : "Badge earned",
    ),
    h("h2", { id }, title),
    detail ? h("p", { id: id + "-detail" }, detail) : null,
    h("form", { method: "dialog" }, h("button", { class: "btn accent" }, action)),
  );
  document.body.append(dialog);
  return new Promise((done) => {
    dialog.addEventListener("close", () => {
      dialog.remove();
      done();
    });
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
    dialog.showModal();
  });
}

export function celebrate(options) {
  queue = queue.then(() => show(options));
  return queue;
}
