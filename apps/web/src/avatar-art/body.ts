import type { Paint } from "./palette.ts";

// Every creature shares the same accessory anchors (eyes at 101/155, brow at 70,
// shoulders at 178), but its silhouette and anatomy are drawn independently.
const eyes = (p: Paint, rx = 6, ry = 8) =>
  `<g fill="${p.dark}"><ellipse cx="101" cy="115" rx="${rx}" ry="${ry}"/><ellipse cx="155" cy="115" rx="${rx}" ry="${ry}"/></g>`;
const blush = `<g fill="#ee98ad" opacity=".5"><ellipse cx="84" cy="134" rx="11" ry="5"/><ellipse cx="172" cy="134" rx="11" ry="5"/></g>`;

function fox(p: Paint) {
  return `<g data-creature="fox">
    <path data-part="brush-tail" d="M92 237C32 247 17 213 29 174Q34 154 48 146C28 188 66 174 85 192Q104 208 92 237Z" fill="${p.fur}"/>
    <path d="M29 174Q34 154 48 146Q38 168 48 180L36 190 27 186Z" fill="${p.light}"/>
    <ellipse cx="131" cy="221" rx="57" ry="62" fill="${p.fur}"/>
    <path data-part="white-chest" d="M99 181Q128 192 159 181L151 213 128 242 105 213Z" fill="${p.light}"/>
    <path d="M66 108L59 31Q87 39 107 70Q128 62 150 70Q173 41 197 31L190 108 173 147 128 178 83 147Z" fill="${p.fur}"/>
    <path d="M72 81L70 49 98 77M159 77L186 49 183 81" fill="#edb3b1"/>
    <path data-part="white-cheeks" d="M66 109Q94 118 108 134L128 157 148 134Q165 117 190 109Q180 151 128 178Q76 151 66 109Z" fill="${p.light}"/>
    ${eyes(p, 5, 7)}
    <path data-part="pointed-muzzle" d="M112 144Q128 136 144 144L128 165Z" fill="${p.light}"/>
    <path d="M120 145Q128 141 136 145L128 153Z" fill="${p.dark}"/>
    <path d="M128 153V159M117 158Q128 167 139 158" fill="none" stroke="${p.dark}" stroke-width="3" stroke-linecap="round"/>
    ${blush}
  </g>`;
}
function cat(p: Paint) {
  return `<g data-creature="cat">
    <path d="M179 234Q221 242 215 211Q213 200 204 202" fill="none" stroke="${p.fur}" stroke-width="19" stroke-linecap="round"/>
    <ellipse cx="128" cy="223" rx="67" ry="61" fill="${p.fur}"/>
    <ellipse cx="128" cy="225" rx="32" ry="36" fill="${p.light}"/>
    <g data-part="rounded-ears"><path d="M65 106L61 75Q58 54 72 59Q92 67 107 87ZM149 87Q164 67 184 59Q198 54 195 75L191 106Z" fill="${p.fur}"/><path d="M74 91L72 72Q84 78 94 91ZM162 91Q172 78 184 72L182 91Z" fill="#eeb7bd"/></g>
    <rect x="61" y="76" width="134" height="105" rx="49" fill="${p.fur}"/>
    <path d="M113 83L119 99M128 80V98M143 83L137 99" stroke="${p.accent}" stroke-width="5" stroke-linecap="round"/>
    <ellipse cx="128" cy="150" rx="28" ry="21" fill="${p.light}"/>
    ${eyes(p, 7, 9)}
    <path data-part="small-nose" d="M122 140Q128 136 134 140L128 146Z" fill="${p.dark}"/>
    <path d="M128 146V150M115 150Q121 158 128 150Q135 158 141 150" fill="none" stroke="${p.dark}" stroke-width="2.5" stroke-linecap="round"/>
    <path data-part="whiskers" d="M94 143L55 137M94 151L54 154M162 143L201 137M162 151L202 154" fill="none" stroke="${p.dark}" stroke-width="2.5" stroke-linecap="round"/>
    ${blush}
  </g>`;
}
function owl(p: Paint) {
  return `<g data-creature="owl">
    <path data-part="round-body" d="M65 91Q57 61 66 51Q84 54 97 70Q128 59 159 70Q173 54 190 51Q199 64 191 91C217 129 211 217 177 246Q128 274 79 246C45 217 39 129 65 91Z" fill="${p.fur}"/>
    <path data-part="wing-shapes" d="M69 153Q35 173 62 230Q69 245 82 247Q100 202 80 165ZM187 153Q221 173 194 230Q187 245 174 247Q156 202 176 165Z" fill="${p.accent}"/>
    <path d="M63 181L76 195M64 199L76 213M193 181L180 195M192 199L180 213" stroke="${p.light}" stroke-width="3" stroke-linecap="round" opacity=".6"/>
    <path data-part="facial-disc" d="M128 90C89 53 58 87 67 121Q75 158 128 179Q181 158 189 121C198 87 167 53 128 90Z" fill="${p.light}"/>
    <g data-part="large-eyes"><circle cx="101" cy="115" r="23" fill="white"/><circle cx="155" cy="115" r="23" fill="white"/><circle cx="101" cy="115" r="14" fill="${p.dark}"/><circle cx="155" cy="115" r="14" fill="${p.dark}"/><g fill="white"><circle cx="97" cy="110" r="5"/><circle cx="151" cy="110" r="5"/></g></g>
    <path data-part="beak" d="M118 144Q128 135 138 144L128 160Z" fill="#cf9759"/>
    <path d="M105 187L110 193 115 187M123 196L128 202 133 196M141 187L146 193 151 187M105 210L110 216 115 210M141 210L146 216 151 210" fill="none" stroke="${p.light}" stroke-width="4" stroke-linecap="round"/>
  </g>`;
}
function dragonling(p: Paint) {
  return `<g data-creature="dragonling">
    <path data-part="wings" d="M76 183L21 138 32 199 47 190 55 219 88 229M180 183L235 138 224 199 209 190 201 219 168 229" fill="${p.accent}"/>
    <path d="M76 183L35 155 47 190M180 183L221 155 209 190" fill="none" stroke="${p.fur}" stroke-width="4"/>
    <ellipse cx="128" cy="220" rx="61" ry="64" fill="${p.fur}"/>
    <path data-part="scaled-belly" d="M103 179Q128 170 153 179Q170 221 154 256H102Q86 221 103 179Z" fill="${p.light}"/>
    <path d="M101 196Q128 206 155 196M98 211Q128 221 158 211M99 228Q128 238 157 228M102 245Q128 253 154 245" fill="none" stroke="${p.accent}" stroke-width="3" opacity=".55"/>
    <path data-part="horns" d="M80 85Q60 64 76 39Q78 60 99 69M157 69Q178 60 180 39Q196 64 176 85" fill="#efdaaa"/>
    <path d="M75 99L54 87 61 116 77 127M181 99L202 87 195 116 179 127" fill="${p.accent}"/>
    <path d="M76 102Q77 74 102 70L116 58 128 70 140 58 154 72Q180 80 181 107L176 145H80Z" fill="${p.fur}"/>
    ${eyes(p, 6, 8)}
    <rect data-part="broad-snout" x="85" y="128" width="86" height="47" rx="23" fill="${p.fur}"/>
    <path d="M93 156Q128 177 163 156" fill="${p.light}"/>
    <g data-part="nostrils" fill="${p.accent}"><ellipse cx="108" cy="142" rx="4" ry="3"/><ellipse cx="148" cy="142" rx="4" ry="3"/></g>
    <path d="M111 158Q128 169 145 158" fill="none" stroke="${p.dark}" stroke-width="3" stroke-linecap="round"/>
  </g>`;
}
function hare(p: Paint) {
  // Preserve the original hare's shapes and accessory alignment.
  return `<g data-creature="hare"><ellipse cx="128" cy="218" rx="73" ry="59" fill="${p.fur}"/><ellipse cx="128" cy="217" rx="43" ry="40" fill="${p.light}"/><ellipse cx="94" cy="55" rx="18" ry="46" fill="${p.fur}"/><ellipse cx="161" cy="55" rx="18" ry="46" fill="${p.fur}"/><rect x="63" y="65" width="130" height="111" rx="54" fill="${p.fur}"/><ellipse cx="128" cy="144" rx="35" ry="27" fill="${p.light}"/>${eyes(p)}<path d="M120 137Q128 133 136 137L128 145Z" fill="${p.dark}"/><path d="M116 151Q128 161 140 151" fill="none" stroke="${p.dark}" stroke-width="3" stroke-linecap="round"/><g fill="#ee98ad" opacity=".55"><ellipse cx="84" cy="134" rx="12" ry="6"/><ellipse cx="172" cy="134" rx="12" ry="6"/></g></g>`;
}
function moth(p: Paint) {
  const wing = `<path d="M110 118C75 57 30 57 24 82C18 112 50 161 95 185C55 174 24 197 38 227C53 255 94 242 116 194Z" fill="${p.fur}"/><path d="M100 128Q62 79 41 89Q37 117 88 158M101 190Q65 192 56 217Q78 229 101 205" fill="none" stroke="${p.light}" stroke-width="10" stroke-linecap="round"/><ellipse cx="62" cy="120" rx="13" ry="18" transform="rotate(-35 62 120)" fill="${p.accent}"/><ellipse cx="62" cy="120" rx="5" ry="8" transform="rotate(-35 62 120)" fill="${p.light}"/>`;
  return `<g data-creature="moth"><g data-part="patterned-wings">${wing}<g transform="translate(256 0) scale(-1 1)">${wing}</g></g><ellipse cx="128" cy="213" rx="35" ry="49" fill="${p.accent}"/><path data-part="antennae" d="M105 85Q78 45 94 36M151 85Q178 45 162 36" fill="none" stroke="${p.dark}" stroke-width="4" stroke-linecap="round"/><circle cx="94" cy="36" r="6" fill="${p.light}"/><circle cx="162" cy="36" r="6" fill="${p.light}"/><path d="M77 110Q72 92 88 86L86 75 104 79Q128 64 152 79L170 75 168 86Q184 92 179 110L181 136Q173 160 155 165L153 175 139 169 128 177 117 169 103 175 101 165Q83 160 75 136Z" fill="${p.fur}"/><path d="M89 131Q101 141 113 134Q128 145 143 134Q155 141 167 131Q164 160 128 165Q92 160 89 131" fill="${p.light}"/>${eyes(p, 7, 9)}<path d="M119 149Q128 155 137 149" fill="none" stroke="${p.dark}" stroke-width="3" stroke-linecap="round"/></g>`;
}
export function body(id: string, p: Paint): string {
  switch (id) {
    case "body-starter":
      return fox(p);
    case "body-cat":
      return cat(p);
    case "body-owl":
      return owl(p);
    case "body-dragonling":
      return dragonling(p);
    case "body-hare":
      return hare(p);
    case "body-moth":
      return moth(p);
    default:
      throw new Error("Unknown reader creature: " + id);
  }
}
