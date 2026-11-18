// Pointer drag tracking with an axis lock, for sheets and the viewer.
//   drag(el, { axis: "y", move(dx, dy), end(dx, dy, velocity) })
// axis: "x", "y" or "both" (locks to the first clear direction).
// touch: only touch and pen pointers drag. ignore: a selector where drags never start.
export function drag(
  el,
  { axis = "both", touch = false, ignore, start, move, end, threshold = 8 },
) {
  let origin = null;
  el.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || (touch && event.pointerType === "mouse")) return;
    if (event.target.closest("button, a, input, textarea, select")) return;
    if (ignore && event.target.closest(ignore)) return;
    origin = { x: event.clientX, y: event.clientY, t: event.timeStamp, lock: null, id: event.pointerId };
  });
  el.addEventListener("pointermove", (event) => {
    if (!origin || event.pointerId !== origin.id) return;
    const dx = event.clientX - origin.x,
      dy = event.clientY - origin.y;
    if (!origin.lock) {
      if (Math.hypot(dx, dy) < threshold) return;
      origin.lock = axis === "both" ? (Math.abs(dx) > Math.abs(dy) ? "x" : "y") : axis;
      if (axis !== "both" && origin.lock === "x" && Math.abs(dy) > Math.abs(dx)) return (origin = null);
      if (axis !== "both" && origin.lock === "y" && Math.abs(dx) > Math.abs(dy)) return (origin = null);
      el.setPointerCapture(event.pointerId);
      start?.(origin.lock);
    }
    move?.(origin.lock === "x" ? dx : 0, origin.lock === "y" ? dy : 0, origin.lock);
  });
  const finish = (event) => {
    if (!origin || event.pointerId !== origin.id) return;
    const o = origin;
    origin = null;
    if (!o.lock) return;
    const dx = o.lock === "x" ? event.clientX - o.x : 0,
      dy = o.lock === "y" ? event.clientY - o.y : 0;
    const ms = Math.max(1, event.timeStamp - o.t);
    end?.(dx, dy, { x: dx / ms, y: dy / ms }, o.lock, event.type === "pointercancel");
  };
  el.addEventListener("pointerup", finish);
  el.addEventListener("pointercancel", finish);
}
