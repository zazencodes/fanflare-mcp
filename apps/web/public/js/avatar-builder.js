import { reward } from "./reward.js";
import { toast } from "./toast.js";
const form = document.querySelector("[data-avatar-form]");
const slots = [
  "background",
  "body",
  "palette",
  "headwear",
  "eyewear",
  "outfit",
  "heldItem",
  "frame",
];
if (form) {
  const preview = form.querySelector("[data-avatar-preview]");
  const tabs = [...form.querySelectorAll(".slot-nav a")];
  const panels = [...form.querySelectorAll(".avatar-slot")];
  const nav = form.querySelector(".slot-nav");
  nav.setAttribute("role", "tablist");
  function activate(tab, focus = false) {
    tabs.forEach((t, i) => {
      const active = t === tab;
      t.setAttribute("role", "tab");
      t.id = "tab-" + i;
      t.setAttribute("aria-controls", panels[i].id);
      t.setAttribute("aria-selected", String(active));
      t.tabIndex = active ? 0 : -1;
      panels[i].hidden = !active;
      panels[i].setAttribute("role", "tabpanel");
      panels[i].setAttribute("aria-labelledby", t.id);
    });
    if (focus) tab.focus();
  }
  activate(tabs[0]);
  tabs.forEach((tab, i) => {
    tab.addEventListener("click", (event) => {
      event.preventDefault();
      activate(tab);
    });
    tab.addEventListener("keydown", (event) => {
      const next =
        event.key === "ArrowRight"
          ? (i + 1) % tabs.length
          : event.key === "ArrowLeft"
            ? (i + tabs.length - 1) % tabs.length
            : event.key === "Home"
              ? 0
              : event.key === "End"
                ? tabs.length - 1
                : null;
      if (next !== null) {
        event.preventDefault();
        activate(tabs[next], true);
      }
    });
  });
  const button = form.querySelector("[data-preview-button]");
  if (button) button.hidden = true;
  form.addEventListener("change", () => {
    const data = new FormData(form),
      avatar = Object.fromEntries(slots.map((slot) => [slot, data.get(slot)]));
    preview.src =
      "/api/avatar-preview?" +
      new URLSearchParams({ avatar: JSON.stringify(avatar) });
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitter = event.submitter,
      data = new FormData(form);
    const status = form.querySelector("[data-form-status]");
    if (submitter) submitter.disabled = true;
    status.textContent = "";
    try {
      const body = Object.fromEntries(data);
      body.avatar = Object.fromEntries(
        slots.map((slot) => [slot, data.get(slot)]),
      );
      const r = await fetch("/api/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await r.json();
      if (!r.ok)
        throw new Error(result.error || "Your changes could not be saved.");
      await reward(result.sparks, "Avatar saved");
      toast("Avatar saved", { tone: "success" });
      status.textContent = "Your avatar is saved.";
      // The saved avatar has a new versioned URL; show it wherever this reader's avatar appears.
      document
        .querySelectorAll(`img[data-avatar="${CSS.escape(result.handle)}"]`)
        .forEach((img) => (img.src = result.avatarSrc));
      form.querySelector("[name=request_key]").value = crypto.randomUUID();
    } catch (error) {
      status.textContent = error.message;
      toast(error.message, { tone: "error" });
    } finally {
      if (submitter) submitter.disabled = false;
    }
  });
}
