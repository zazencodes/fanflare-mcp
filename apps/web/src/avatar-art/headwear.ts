export function headwear(id: string) {
  if (id === "headwear-ribbon")
    return `<path d="M163 69Q145 41 166 43L177 60Q194 36 202 53Q208 71 179 74Z" fill="#e9a99a"/><circle cx="176" cy="67" r="7" fill="#fff1d8"/>`;
  if (id === "headwear-starter") return "";
  if (id === "crown")
    return `<path d="M86 69L77 35 106 47 128 21 150 47 179 35 170 69Z" fill="#f2cd78" stroke="#967053" stroke-width="3"/><circle cx="128" cy="51" r="5" fill="#bb8ade"/>`;
  if (id === "headwear-wizard")
    return `<path d="M81 70L124 12 165 70" fill="#6851b8"/><ellipse cx="124" cy="71" rx="58" ry="10" fill="#8071c9"/><path d="M124 36L127 44 135 44 129 49 131 57 124 52 117 57 119 49 113 44 121 44" fill="#ffe9af"/>`;
  if (id === "headwear-flower")
    return `<g fill="#f4aeca"><circle cx="173" cy="66" r="12"/><circle cx="188" cy="74" r="12"/><circle cx="182" cy="88" r="12"/><circle cx="165" cy="85" r="12"/></g><circle cx="176" cy="77" r="8" fill="#ffdc8b"/>`;
  return `<path d="M82 72Q76 36 127 36Q171 36 174 69" fill="${id === "headwear-beret" ? "#565382" : id === "headwear-moon" ? "#a5b9df" : "#d699a9"}"/><rect x="80" y="64" width="96" height="13" rx="6" fill="#fff0dc"/><path d="M125 39L130 26" stroke="#565382" stroke-width="6" stroke-linecap="round"/>`;
}
