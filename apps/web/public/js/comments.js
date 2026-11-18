import { toast } from "./toast.js";
import { reward } from "./reward.js";
import { fetchFragment } from "./dom.js";
import { bind } from "./keys.js";

async function refreshFrame(frame) {
  const id = frame.querySelector("[name=post]")?.value;
  if (!id) return;
  const params =
    frame.querySelector("[data-viewer-next],[data-viewer-previous]")?.search ||
    location.search;
  const fragment = await fetchFragment(
    "/api/posts/" + encodeURIComponent(id) + "/viewer" + params,
  );
  const replacement = fragment.querySelector("[data-viewer-frame]");
  // Keep the mobile handle and the viewer's event bindings on its original frame.
  const panel = frame.querySelector("[data-viewer-panel]");
  const handle = panel.querySelector(".viewer-handle");
  panel.replaceChildren(
    ...replacement.querySelector("[data-viewer-panel]").childNodes,
  );
  if (handle) panel.prepend(handle);
}
document.addEventListener("submit", async (event) => {
  const form = event.target.closest?.("[data-social-form]");
  if (!form) return;
  event.preventDefault();
  const button = event.submitter || form.querySelector("button");
  if (button?.disabled) return;
  if (button) button.disabled = true;
  try {
    const fields = Object.fromEntries(new FormData(form));
    if ("active" in fields) fields.active = fields.active === "true";
    const r = await fetch(form.action, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    const data = await r.json();
    if (!r.ok) throw Error(data.error || "The action could not be saved.");
    if (data.sparks) reward(data.sparks, "Saved");
    if (!data.sparks?.delta)
      toast(
        form.dataset.toggle
          ? "Saved"
          : form.hasAttribute("data-comment-action")
            ? "Conversation updated"
            : "Saved",
        { tone: "success" },
      );
    const frame = form.closest("[data-viewer-frame]");
    if (frame) {
      await refreshFrame(frame);
      if (form.dataset.toggle)
        frame
          .querySelector("[data-viewer-action=" + form.dataset.toggle + "]")
          ?.focus({ preventScroll: true });
      else if (form.hasAttribute("data-comment-action"))
        frame
          .querySelector(".comment-compose textarea")
          ?.focus({ preventScroll: true });
    } else {
      if (form.dataset.toggle) {
        const active = form.querySelector("[name=active]");
        const pressed = form.querySelector("[aria-pressed]");
        const count = form.querySelector("[data-count]");
        if (count)
          count.textContent =
            Number(count.textContent) + (data.active ? 1 : -1);
        active.value = data.active ? "false" : "true";
        pressed?.setAttribute("aria-pressed", String(data.active));
      }
      const key = form.querySelector("[name=request_key]");
      if (key) key.value = crypto.randomUUID();
    }
  } catch (error) {
    toast(error.message, { tone: "error" });
  } finally {
    if (button) button.disabled = false;
  }
});
document.addEventListener("click", async (event) => {
  const button = event.target.closest?.("[data-share-url]");
  if (!button) return;
  event.preventDefault();
  try {
    if (matchMedia("(max-width:767.98px)").matches && navigator.share)
      await navigator.share({ url: button.dataset.shareUrl });
    else {
      await navigator.clipboard.writeText(button.dataset.shareUrl);
      toast("Artwork link copied", { tone: "success" });
    }
  } catch (error) {
    if (error.name !== "AbortError")
      toast("Could not share this link.", { tone: "error" });
  }
});
for (const [key, action] of [
  ["u", "upvote"],
  ["f", "favorite"],
])
  bind(key, () =>
    document
      .querySelector(".artwork-permalink [data-viewer-action=" + action + "]")
      ?.click(),
  );

for (const [key, selector] of [
  ["j", "next"],
  ["ArrowRight", "next"],
  ["k", "previous"],
  ["ArrowLeft", "previous"],
])
  bind(key, () => {
    const link = document.querySelector(
      ".artwork-permalink [data-viewer-" + selector + "]",
    );
    if (link) location.assign(link.href);
  });
