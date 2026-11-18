import { CATALOG } from "../store.ts";
import { background } from "./background.ts";
import { palette } from "./palette.ts";
import { body } from "./body.ts";
import { headwear } from "./headwear.ts";
import { eyewear } from "./eyewear.ts";
import { outfit } from "./outfit.ts";
import { heldItem } from "./held-item.ts";
import { frame } from "./frame.ts";
import type { Avatar } from "../../../../packages/contracts/social.ts";
export const STARTER: Avatar = {
  background: "background-starter",
  body: "body-starter",
  palette: "palette-starter",
  headwear: "headwear-starter",
  eyewear: "eyewear-starter",
  outfit: "outfit-starter",
  heldItem: "helditem-starter",
  frame: "frame-starter",
};
export function normalizeAvatar(input: Avatar): Required<Avatar> {
  const value = { ...STARTER };
  for (const item of CATALOG)
    if (input[item.slot] === item.id) value[item.slot] = item.id;
  return value as Required<Avatar>;
}
/** Supply a unique instance namespace when embedding multiple SVGs in one document. */
export function renderAvatar(input: Avatar, namespace: string): string {
  const a = normalizeAvatar(input),
    ns =
      "avatar-" +
      Array.from(namespace)
        .map((c) => c.codePointAt(0)!.toString(16))
        .join("-");
  const p = palette(a.palette);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" role="img" aria-labelledby="${ns}-title"><title id="${ns}-title">A little library companion</title><defs><clipPath id="${ns}-clip"><rect width="256" height="256" rx="64"/></clipPath></defs><g clip-path="url(#${ns}-clip)">${background(a.background, ns)}${input.body ? body(a.body, p) + outfit(a.outfit) + eyewear(a.eyewear) + headwear(a.headwear) + heldItem(a.heldItem, p) : `<circle cx="128" cy="102" r="39" fill="#adb1ce"/><path d="M54 256V227Q54 165 128 165Q202 165 202 227V256" fill="#adb1ce"/>`}</g>${frame(a.frame)}</svg>`;
}
