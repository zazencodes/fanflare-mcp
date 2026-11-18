// Toasts: short, polite announcements. toast("Saved") · sparks(50, "Published artwork").
import { h, icon } from "./dom.js";

const region = () => document.getElementById("toasts");
const number = new Intl.NumberFormat("en");
const icons = { success: "check", error: "alert", sparks: "spark" };

function raise(el) {
  if (!el.matches(":popover-open")) el.showPopover();
  else if (document.querySelector("dialog:modal")) {
    // A modal opened after the region: re-enter the top layer above it.
    el.hidePopover();
    el.showPopover();
  }
}

function dismiss(el) {
  if (!el.isConnected || el.classList.contains("is-leaving")) return;
  el.classList.add("is-leaving");
  setTimeout(() => el.remove(), 260);
}

/**
 * Show a toast. tone: "info" | "success" | "error" | "sparks".
 * Returns the toast element.
 */
export function toast(message, { tone = "info", duration } = {}) {
  const r = region();
  const el = h(
    "div",
    { class: "toast " + tone },
    icons[tone] ? icon(icons[tone]) : null,
    typeof message === "string" ? h("span", {}, message) : message,
  );
  el.addEventListener("click", () => dismiss(el));
  raise(r);
  requestAnimationFrame(() => r.append(el));
  setTimeout(() => dismiss(el), duration ?? (tone === "error" ? 7000 : 3600));
  return el;
}

/** Set the header sparks chip to a balance from a server result, with a small bump. */
export function setBalance(balance) {
  const chip = document.querySelector("[data-sparks]");
  if (!chip) return;
  chip.querySelector("[data-sparks-count]").textContent = number.format(balance);
  chip.classList.remove("is-bumped");
  void chip.offsetWidth;
  chip.classList.add("is-bumped");
}

/**
 * "+N sparks" feedback (negative amounts read "−N sparks"). Pass the new balance from
 * the server result to update the header chip.
 */
export function sparks(amount, { reason, balance } = {}) {
  if (balance !== undefined) setBalance(balance);
  const sign = amount < 0 ? "−" : "+";
  return toast(
    h(
      "span",
      {},
      h("span", { class: "toast-amount" }, sign + number.format(Math.abs(amount))),
      " sparks",
      reason ? " · " + reason : "",
    ),
    { tone: "sparks" },
  );
}

// The live region must be rendered before anything is announced into it.
const r = region();
if (r) r.showPopover();
