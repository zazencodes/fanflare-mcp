// Ordered masonry for [data-masonry] canvases. Each tile goes into the shortest column
// (leftmost on ties), so reading order runs left to right, top to bottom, and the first
// tile is top left. DOM order is unchanged, so keyboard order matches reading order.
// Column count and gap come from CSS: --canvas-cols and --canvas-gap.
//   const m = masonry(el); m.append(nodes); m.prepend(tile); m.layout()
const instances = new WeakMap();

export function masonry(container) {
  if (instances.has(container)) return instances.get(container);
  let cols = 0,
    gap = 0,
    width = 0,
    colWidth = 0,
    heights = [];

  const tiles = () => [...container.querySelectorAll(":scope > [data-tile]")];

  function measure() {
    const style = getComputedStyle(container);
    cols = Math.max(1, parseInt(style.getPropertyValue("--canvas-cols"), 10) || 1);
    gap = parseFloat(style.getPropertyValue("--canvas-gap")) || 0;
    width = container.clientWidth;
    colWidth = (width - gap * (cols - 1)) / cols;
  }

  function place(list) {
    for (const tile of list) tile.style.width = colWidth + "px";
    const sizes = list.map((tile) => tile.offsetHeight);
    list.forEach((tile, i) => {
      let c = 0;
      for (let k = 1; k < cols; k++) if (heights[k] < heights[c] - 0.5) c = k;
      tile.style.transform = `translate(${c * (colWidth + gap)}px, ${heights[c]}px)`;
      heights[c] += sizes[i] + gap;
    });
    container.style.height = Math.max(0, Math.max(...heights) - gap) + "px";
  }

  function layout() {
    measure();
    heights = Array(cols).fill(0);
    place(tiles());
  }

  container.classList.add("is-placed");
  layout();
  requestAnimationFrame(() => container.classList.add("is-animated"));
  let frame = 0;
  new ResizeObserver(() => {
    if (container.clientWidth === width) return;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(layout);
  }).observe(container);

  const api = {
    layout,
    /** Place tiles already appended to the container (endless scroll). */
    append(nodes) {
      place(nodes.filter((n) => n instanceof HTMLElement && n.matches("[data-tile]")));
    },
    /** Insert a tile at the top left and reflow (a fresh upload). */
    prepend(tile) {
      container.prepend(tile);
      layout();
    },
    remove(tile) {
      tile.remove();
      layout();
    },
  };
  instances.set(container, api);
  return api;
}
