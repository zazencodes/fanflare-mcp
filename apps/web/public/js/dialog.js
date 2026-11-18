// Overlays and bottom sheets built with <Dialog> (apps/web/src/ui/components.tsx).
//   openDialog("filters") · closeDialog("filters")
// Declarative: any element with data-dialog-open="<id>" opens that dialog on click
// (give links a no-script href). Backdrop clicks, Escape and <form method="dialog">
// close with an exit animation; on mobile, sheets close by dragging the handle down.
import { afterAnimation, mobile } from "./dom.js";
import { drag } from "./gestures.js";

const resolve = (target) =>
  typeof target === "string" ? document.getElementById(target) : target;

export function openDialog(target) {
  const dialog = resolve(target);
  if (!(dialog instanceof HTMLDialogElement)) throw new Error("No dialog: " + target);
  if (!dialog.open) {
    enhance(dialog);
    dialog.classList.remove("is-closing");
    dialog.style.removeProperty("--drag");
    dialog.showModal();
    dialog.dispatchEvent(new CustomEvent("dialog:open"));
  }
  return dialog;
}

export async function closeDialog(target, returnValue) {
  const dialog = resolve(target);
  if (!dialog?.open || dialog.classList.contains("is-closing")) return;
  dialog.classList.add("is-closing");
  await afterAnimation(dialog, 320);
  dialog.classList.remove("is-closing");
  dialog.style.removeProperty("--drag");
  dialog.close(returnValue);
}

const enhanced = new WeakSet();
function enhance(dialog) {
  if (enhanced.has(dialog)) return;
  enhanced.add(dialog);
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeDialog(dialog);
  });
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    const inside =
      event.clientX >= r.left && event.clientX <= r.right &&
      event.clientY >= r.top && event.clientY <= r.bottom;
    if (!inside) closeDialog(dialog);
  });
  dialog.addEventListener("submit", (event) => {
    const form = event.target;
    if (form.method !== "dialog") return;
    event.preventDefault();
    closeDialog(dialog, event.submitter?.value);
  });
  const handle = dialog.querySelector(".dialog-head");
  if (handle && dialog.classList.contains("sheet-mobile"))
    drag(handle, {
      axis: "y",
      move(_, dy) {
        if (!mobile.matches) return;
        dialog.style.setProperty("--drag", Math.max(0, dy) + "px");
      },
      end(_, dy, velocity) {
        if (!mobile.matches) return;
        if (dy > 110 || velocity.y > 0.6) closeDialog(dialog);
        else dialog.style.removeProperty("--drag");
      },
    });
}

document.addEventListener("click", (event) => {
  const trigger = event.target.closest?.("[data-dialog-open]");
  if (!trigger || event.ctrlKey || event.metaKey || event.shiftKey) return;
  event.preventDefault();
  openDialog(trigger.dataset.dialogOpen);
});
