// One feedback path for W2's exact transactional sparks outcome.
// await reward(result.sparks, "Upvoted");
// Pass { next: "/u/reader" } when an action navigates. Feedback is replayed once
// on the destination, so a redirect cannot cut off its toast or celebration.
import { sparks, setBalance, toast } from "./toast.js";
import { celebrate } from "./celebrate.js";
const flashKey = "fanflare:reward";

export async function reward(outcome, reason, { next } = {}) {
  if (next) {
    const destination = new URL(next, location.href);
    if (destination.origin !== location.origin)
      throw new Error("Reward destination must be on Fanflare");
    sessionStorage.setItem(flashKey, JSON.stringify({ outcome, reason }));
    location.assign(destination.href);
    return;
  }
  if (outcome.delta)
    sparks(outcome.delta, { reason, balance: outcome.balance });
  else setBalance(outcome.balance);
  const chip = document.querySelector("[data-sparks]");
  if (chip)
    chip.setAttribute(
      "aria-label",
      new Intl.NumberFormat("en").format(outcome.balance) +
        " sparks" +
        (outcome.level === null
          ? ""
          : ", level " + outcome.level + " " + outcome.title),
    );
  if (outcome.leveledUp && outcome.level !== null)
    await celebrate({
      kind: "level",
      level: outcome.level,
      title: outcome.title,
      detail: "You reached level " + outcome.level + ".",
    });
  for (const badge of outcome.newBadges)
    await celebrate({ kind: "badge", title: badge });
}

// app.js imports this module on every page; feature modules share that instance.
const flash = sessionStorage.getItem(flashKey);
if (flash) {
  sessionStorage.removeItem(flashKey);
  const { outcome, reason } = JSON.parse(flash);
  if (!outcome.delta && reason) toast(reason, { tone: "success" });
  void reward(outcome, reason);
}
