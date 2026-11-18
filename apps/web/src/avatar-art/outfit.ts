export function outfit(id: string) {
  if (id === "outfit-knit")
    return `<path d="M87 178L105 181 128 199 151 181 169 178 180 256H76Z" fill="#dcae9d"/><path d="M105 181L128 206 151 181M79 244H177M79 249H177" fill="none" stroke="#fff0dc" stroke-width="4"/><path d="M96 216L105 225 114 216 123 225 132 216 141 225 150 216 159 225" fill="none" stroke="#b87c81" stroke-width="3"/>`;
  if (id === "outfit-starter") return "";
  if (id === "outfit-scarf")
    return `<path d="M79 174Q128 191 177 174L181 190Q128 211 75 190Z" fill="#ce89a5"/><path d="M143 192L166 187 175 236 150 239Z" fill="#ce89a5"/><path d="M151 225L172 222M153 232L174 229" stroke="#fff0dc" stroke-width="3"/>`;
  if (id === "outfit-cloak")
    return `<path d="M80 173L43 256H213L176 173 128 204Z" fill="#6c599a"/><path d="M95 184L128 204 161 184M128 204L113 256" fill="none" stroke="#c4a2cf" stroke-width="4"/><circle cx="128" cy="201" r="7" fill="#f4d49a"/>`;
  if (id === "outfit-apron")
    return `<path d="M91 178L105 179V203H151V179L165 178 181 256H75Z" fill="#a4bda9"/><path d="M105 222H151V244H105Z" fill="#dce6cf"/><path d="M104 205H152" stroke="#f9f0df" stroke-width="4"/>`;
  const c = id === "outfit-cardigan" ? "#7789bd" : "#9981c3";
  return `<path d="M76 177Q128 195 180 177L193 256H63Z" fill="${c}"/><path d="M108 185L128 206 148 185M128 206V255" fill="none" stroke="#fff0dc" stroke-width="4"/><g fill="#fff0dc"><circle cx="137" cy="220" r="3"/><circle cx="137" cy="234" r="3"/><circle cx="137" cy="248" r="3"/></g>`;
}
