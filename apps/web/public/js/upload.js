import { openDialog, closeDialog } from "./dialog.js";
import { toast } from "./toast.js";
import { reward } from "./reward.js";
import { fetchFragment } from "./dom.js";
import { masonry } from "./masonry.js";
const dialog = document.getElementById("upload-artwork");
if (dialog) {
  const content = dialog.querySelector("[data-upload-content]");
  const initial = content.cloneNode(true);
  function reset() {
    content.replaceChildren(...initial.cloneNode(true).childNodes);
    content.querySelector("[name=request_key]").value = crypto.randomUUID();
  }
  let previewSequence = 0;
  const open = () => openDialog(dialog);
  document.querySelectorAll("[data-upload-open]").forEach((link) =>
    link.addEventListener("click", (event) => {
      event.preventDefault();
      open();
    }),
  );
  function preview(file) {
    if (!file) return;
    const input = content.querySelector("[name=image]");
    if (!input) return;
    const error = content.querySelector("[data-upload-error]");
    const image = content.querySelector("[data-local-preview]");
    const sequence = ++previewSequence;
    image.hidden = true;
    image.removeAttribute("src");
    error.textContent = "";
    if (file.size > 12 * 1024 * 1024) {
      error.textContent =
        "This image is too large. Choose a file up to 12 MiB.";
      input.value = "";
      return;
    }
    if (
      ![
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/heic",
        "image/heif",
      ].includes(file.type)
    ) {
      error.textContent =
        "Unsupported image type. Choose JPEG, PNG, WebP or HEIC.";
      input.value = "";
      return;
    }
    const fileReader = new FileReader();
    fileReader.onload = () => {
      if (sequence !== previewSequence) return;
      image.hidden = false;
      image.src = fileReader.result;
    };
    fileReader.onerror = () => {
      error.textContent =
        "This image could not be read. Choose the file again.";
    };
    fileReader.readAsDataURL(file);
    image.onerror = () => {
      image.hidden = true;
      error.textContent =
        "Your browser cannot preview this file. Continue to process it; if HEIC decoding fails, export it as JPEG or PNG.";
    };
  }
  dialog.addEventListener("change", (event) => {
    if (event.target.matches("[name=image]")) preview(event.target.files[0]);
  });
  const canvas = document.querySelector(".book-art");
  canvas?.addEventListener("dragover", (event) => {
    if (event.dataTransfer.types.includes("Files")) {
      event.preventDefault();
      canvas.classList.add("is-dragging");
    }
  });
  canvas?.addEventListener("dragleave", () =>
    canvas.classList.remove("is-dragging"),
  );
  canvas?.addEventListener("drop", (event) => {
    event.preventDefault();
    canvas.classList.remove("is-dragging");
    const file = event.dataTransfer.files[0];
    if (!file) return;
    open();
    const input = content.querySelector("[name=image]");
    if (!input) {
      toast("Finish the current preview first.");
      return;
    }
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    preview(file);
  });
  dialog.addEventListener("submit", async (event) => {
    const form = event.target;
    if (!form.matches("[data-upload-prepare],[data-upload-publish]")) return;
    event.preventDefault();
    const button = form.querySelector("button");
    if (button.disabled) return;
    button.disabled = true;
    const error = form.querySelector("[data-upload-error]");
    error.textContent = "";
    let published = false;
    try {
      const publish = form.hasAttribute("data-upload-publish");
      const r = await fetch(form.action, {
        method: "POST",
        body: new FormData(form),
        headers: { Accept: "application/json" },
      });
      if (!r.ok) {
        let message;
        try {
          message = (await r.json()).error;
        } catch {
          message = "The image could not be processed (" + r.status + ").";
        }
        throw Error(message);
      }
      if (!publish) {
        const prepared = await r.json();
        content.replaceChildren(await fetchFragment(prepared.preview));
        return;
      }
      const result = await r.json();
      published = true;
      await closeDialog(dialog);
      reset();
      if (result.sparks.delta) reward(result.sparks, "Artwork published");
      else toast("Artwork published", { tone: "success" });
      // New publication starts a Recent canvas so the upload is always first.
      const book = document.querySelector("[data-book]").dataset.book;
      if (!result.visible) {
        toast(
          "Published. This artwork is outside your saved spoiler boundary.",
        );
        return;
      }
      const grid = document.querySelector("[data-masonry]");
      const params = new URLSearchParams(location.search);
      if (
        !grid ||
        [...params].some(([key, value]) => key !== "sort" || value !== "recent")
      ) {
        location.assign(
          "/books/" + book + "?published=" + encodeURIComponent(result.post),
        );
        return;
      }
      const page = await fetchFragment(
        "/api/canvas?scope=book:" + encodeURIComponent(book) + "&sort=recent",
      );
      const tile = page.querySelector(
        '[data-post="' + CSS.escape(result.post) + '"]',
      );
      if (!tile)
        throw Error(
          "Published, but the new artwork could not be refreshed. Reload the book page.",
        );
      tile.classList.add("is-fresh");
      masonry(grid).prepend(tile);
      grid.previousElementSibling?.matches(".empty") &&
        grid.previousElementSibling.remove();
      tile.scrollIntoView({
        block: "center",
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
    } catch (err) {
      if (published) toast(err.message, { tone: "error" });
      else {
        error.textContent = err.message;
        error.scrollIntoView({ block: "nearest" });
      }
    } finally {
      button.disabled = false;
    }
  });
}
