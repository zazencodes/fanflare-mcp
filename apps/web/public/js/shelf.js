import { reward } from "./reward.js";
import { toast } from "./toast.js";

document.addEventListener("submit", async (event) => {
  const form = event.target.closest("[data-shelf-action]");
  if (!form) return;
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form, event.submitter));
  const buttons = [...form.querySelectorAll("button")];
  buttons.forEach((button) => (button.disabled = true));
  try {
    const response = await fetch(form.action, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    const page = await fetch("/me/shelf");
    if (!page.ok)
      throw new Error(
        "Shelf could not be refreshed. Reload to see your changes.",
      );
    const html = new DOMParser().parseFromString(
      await page.text(),
      "text/html",
    );
    document.querySelector("#main").replaceWith(html.querySelector("#main"));
    const heading = document.querySelector("#main h1");
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
    await reward(
      result.sparks,
      data.state === "remove" ? "Removed from shelf" : "Shelf updated",
    );
    if (!result.sparks.delta) toast("Shelf updated", { tone: "success" });
  } catch (error) {
    toast(error.message, { tone: "error" });
  } finally {
    buttons.forEach((button) => (button.disabled = false));
  }
});
