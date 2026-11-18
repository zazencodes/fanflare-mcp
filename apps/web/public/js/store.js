import { reward } from "./reward.js";
import { toast } from "./toast.js";
const store = document.querySelector("[data-store]");
store?.addEventListener("click", (event) => {
  const link = event.target.closest("[data-try-avatar]");
  if (!link || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey)
    return;
  event.preventDefault();
  store.querySelector("[data-store-preview]").src =
    "/api/avatar-preview?" +
    new URLSearchParams({ avatar: link.dataset.tryAvatar });
  store.querySelector("[data-try-name]").textContent = link.dataset.itemName;
  if (matchMedia("(max-width: 767px)").matches)
    store.querySelector(".store-preview").scrollIntoView({
      block: "start",
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  store
    .querySelectorAll("[data-try-avatar]")
    .forEach((el) => el.classList.toggle("is-trying", el === link));
});
store?.addEventListener("submit", async (event) => {
  const form = event.target.closest("[data-store-action]");
  if (!form) return;
  event.preventDefault();
  const button = form.querySelector("button"),
    data = Object.fromEntries(new FormData(form));
  button.disabled = true;
  try {
    const r = await fetch(form.action, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const result = await r.json();
    if (!r.ok)
      throw new Error(result.error || "Your purchase could not be completed.");
    await reward(
      result.sparks,
      form.action.endsWith("store-buy")
        ? "Added to your wardrobe"
        : "Avatar updated",
      { next: location.href },
    );
  } catch (error) {
    store.querySelector("[data-store-status]").textContent = error.message;
    toast(error.message, { tone: "error" });
    button.disabled = false;
  }
});
