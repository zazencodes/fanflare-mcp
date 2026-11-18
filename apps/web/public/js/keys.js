// Keyboard shortcuts: lowercase letters, "/", and named keys (ArrowLeft, Escape…).
// Shift is never part of a shortcut. Shortcuts never fire while typing in a field.
// Layers stack: the newest layer that defines a key wins. A layer bound to a modal
// dialog is the only one consulted while that dialog is open.
const layers = [{ scope: null, keys: new Map() }];

function checkKey(key) {
  if (/^[A-Z]$/.test(key))
    throw new Error("Shortcuts use lowercase keys only: " + key);
}

/** Bind a site-wide shortcut. Returns an unbind function. */
export function bind(key, handler) {
  checkKey(key);
  layers[0].keys.set(key, handler);
  return () => layers[0].keys.delete(key);
}

/**
 * Push a layer of shortcuts, for example while the viewer is open:
 * const pop = pushLayer({ j: next, k: previous }, dialogElement)
 */
export function pushLayer(bindings, scope = null) {
  const keys = new Map();
  for (const [key, handler] of Object.entries(bindings)) {
    checkKey(key);
    keys.set(key, handler);
  }
  const layer = { scope, keys };
  layers.push(layer);
  return () => {
    const i = layers.indexOf(layer);
    if (i > 0) layers.splice(i, 1);
  };
}

const typing = (el) =>
  el instanceof HTMLElement &&
  (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

document.addEventListener("keydown", (event) => {
  if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey)
    return;
  if (event.isComposing || typing(event.target)) return;
  const modal = document.querySelector("dialog:modal");
  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i];
    if (modal && layer.scope !== modal) continue;
    const handler = layer.keys.get(event.key);
    if (!handler) continue;
    if (handler(event) !== false) event.preventDefault();
    return;
  }
});
