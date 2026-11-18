// The header eye switch posts to /api/prefs/spoilers in place, then re-renders the page.
// A page module can refresh its own content instead: listen for "fanflare:prefs" on
// document and call event.preventDefault() to skip the reload.
// Every change is announced with a toast (touch devices have no tooltip); across the
// reload it is replayed once from session storage.
import { toast } from "./toast.js";
import { icon } from "./dom.js";

const flashKey = "fanflare:spoilers";
const announce = (hidden) =>
  toast(
    hidden
      ? "Spoilers hidden · only art up to your place in each book"
      : "Spoilers shown · all art is visible",
  );
const tip = (hidden) =>
  hidden ? "Spoilers hidden · click to show" : "Spoilers shown · click to hide";

document.addEventListener("submit", async (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || !form.matches("[data-spoiler-switch]"))
    return;
  event.preventDefault();
  const button = form.querySelector("button");
  const hiding = form.elements.namedItem("hidden").value === "1";
  button.setAttribute("aria-pressed", String(hiding));
  button.classList.add("is-busy");
  try {
    const r = await fetch(form.action, {
      method: "POST",
      body: new FormData(form),
      headers: { Accept: "application/json" },
    });
    if (!r.ok) throw new Error("Request failed (" + r.status + ")");
    const { prefs } = await r.json();
    form.elements.namedItem("hidden").value = prefs.spoilersHidden ? "0" : "1";
    button.setAttribute("aria-pressed", String(prefs.spoilersHidden));
    button.replaceChildren(icon(prefs.spoilersHidden ? "eye-off" : "eye"));
    form.querySelector("[data-tooltip]").textContent = tip(prefs.spoilersHidden);
    const proceed = document.dispatchEvent(
      new CustomEvent("fanflare:prefs", { detail: prefs, cancelable: true }),
    );
    if (!proceed) return announce(prefs.spoilersHidden);
    sessionStorage.setItem(flashKey, String(prefs.spoilersHidden));
    location.reload();
  } catch {
    button.setAttribute("aria-pressed", String(!hiding));
    toast("Your spoiler setting could not be saved. Try again.", {
      tone: "error",
    });
  } finally {
    button.classList.remove("is-busy");
  }
});

const flash = sessionStorage.getItem(flashKey);
if (flash) {
  sessionStorage.removeItem(flashKey);
  announce(flash === "true");
}
