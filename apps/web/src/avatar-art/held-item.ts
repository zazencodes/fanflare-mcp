import type { Paint } from "./palette.ts";
export function heldItem(id: string, p: Paint) {
  if (id === "helditem-none") return "";
  if (id === "helditem-tea")
    return `<path d="M101 207H157V228Q129 247 101 228Z" fill="#fff3df" stroke="#9b7d9d" stroke-width="3"/><path d="M157 211Q180 209 174 223Q170 232 157 226M119 194Q111 186 121 179M136 194Q128 186 138 179" fill="none" stroke="#c9a6ac" stroke-width="5" stroke-linecap="round"/>`;
  if (id === "helditem-lantern")
    return `<path d="M116 200V185Q128 168 140 185V200" fill="none" stroke="#5d527b" stroke-width="5"/><rect x="106" y="198" width="44" height="45" rx="10" fill="#f6d28b" stroke="#5d527b" stroke-width="5"/><ellipse cx="128" cy="221" rx="8" ry="13" fill="#fff5c8"/>`;
  if (id === "helditem-quill")
    return `<path d="M111 242L161 180Q178 173 171 192L118 239" fill="#fff2e8" stroke="#796399" stroke-width="3"/><path d="M116 238L161 190" stroke="#796399" stroke-width="3"/>`;
  const c =
    id === "helditem-atlas"
      ? "#6d97a6"
      : id === "helditem-grimoire"
        ? "#65508e"
        : id === "helditem-gold"
          ? "#bf9459"
          : "#7567a8";
  return `<path d="M81 200Q105 194 128 206Q151 194 175 200V242Q151 235 128 248Q105 235 81 242Z" fill="${c}"/><path d="M88 201Q108 198 128 210Q148 198 168 201V233Q147 229 128 240Q109 229 88 233Z" fill="#fff3de"/><path d="M128 210V240M95 211L118 216M95 219L118 224M139 216L161 211M139 224L161 219" stroke="#d1bda7" stroke-width="2"/><ellipse cx="80" cy="220" rx="10" ry="14" fill="${p.fur}"/><ellipse cx="176" cy="220" rx="10" ry="14" fill="${p.fur}"/>`;
}
