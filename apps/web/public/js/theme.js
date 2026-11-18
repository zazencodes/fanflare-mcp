// The header theme toggle posts to /api/prefs/theme in place. The server already renders
// the chosen theme on <html>, so this only mirrors that: data-theme, the theme-color
// metas and color-scheme. CSS then shows the button for the other theme.
import { toast } from "./toast.js";

const root = document.documentElement;

function apply(theme) {
  root.dataset.theme = theme;
  document.querySelector('meta[name="color-scheme"]').content = theme;
  for (const meta of document.querySelectorAll("meta[data-theme-color]")) {
    if (meta.dataset.themeColor === theme) meta.removeAttribute("media");
    else meta.media = "not all";
  }
}

document.addEventListener("submit", async (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || !form.matches("[data-theme-switch]"))
    return;
  event.preventDefault();
  const button = event.submitter;
  const body = new FormData(form, button);
  try {
    const r = await fetch(form.action, {
      method: "POST",
      body,
      headers: { Accept: "application/json" },
    });
    if (!r.ok) throw new Error("Request failed (" + r.status + ")");
    const { theme } = await r.json();
    // The pressed button is about to be hidden; keep focus on the one that appears.
    const focused = button.matches(":focus");
    apply(theme);
    if (focused)
      form.querySelector(`button[value="${theme === "dark" ? "light" : "dark"}"]`).focus();
  } catch {
    toast("Your theme could not be saved. Try again.", { tone: "error" });
  }
});
