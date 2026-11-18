// Demo wiring for the moderator design reference (/admin/design).
import { toast, sparks } from "./toast.js";
import { celebrate } from "./celebrate.js";
import { reward } from "./reward.js";

const demos = {
  toast: () => toast("Saved to your shelf", { tone: "success" }),
  sparks: () => sparks(50, { reason: "Published artwork", balance: 1290 }),
  error: () => toast("That could not be saved. Try again.", { tone: "error" }),
  level: () =>
    celebrate({
      kind: "level",
      level: 5,
      title: "Page Turner",
      detail: "You reached level 5. New store items are unlocked.",
    }),
  outcome: () =>
    reward(
      {
        delta: 50,
        balance: 1340,
        lifetime: 510,
        level: 5,
        title: "Page Turner",
        leveledUp: true,
        newBadges: ["First Light"],
      },
      "Published artwork",
    ),
  badge: () =>
    celebrate({
      kind: "badge",
      title: "First Light",
      detail: "You published your first artwork.",
    }),
};
document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-demo]");
  if (button) demos[button.dataset.demo]();
});

// Sample tiles toggle in place; real canvases post to the social endpoints.
document.addEventListener("submit", (event) => {
  const form = event.target.closest("[data-tile-action]");
  if (!form) return;
  event.preventDefault();
  const button = form.querySelector("button");
  const on = button.getAttribute("aria-pressed") !== "true";
  button.setAttribute("aria-pressed", String(on));
  const count = button.querySelector("[data-count]");
  if (count) count.textContent = String(Number(count.textContent) + (on ? 1 : -1));
  if (on) sparks(form.dataset.tileAction === "upvote" ? 2 : 1, { reason: "Thanks for the love" });
});
