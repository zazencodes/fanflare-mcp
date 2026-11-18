export function background(id: string, ns: string) {
  const colours: Record<string, string[]> = {
    "background-starter": ["#e5e4fb", "#fce8e6"],
    "background-sky": ["#d8eff6", "#e9e5ff"],
    "background-peach": ["#fff0d8", "#f7ddeb"],
    "background-garden": ["#c9e6da", "#f5eed6"],
    "background-midnight": ["#4c548a", "#9692cb"],
    "background-aurora": ["#b8e9dd", "#d6b7f0"],
    "background-starlit": ["#7777b6", "#e6c8ee"],
  };
  const c = colours[id] ?? colours["background-starter"];
  return `<defs><linearGradient id="${ns}-paper" x2="1" y2="1"><stop stop-color="${c[0]}"/><stop offset="1" stop-color="${c[1]}"/></linearGradient></defs><rect width="256" height="256" rx="64" fill="url(#${ns}-paper)"/><circle cx="200" cy="55" r="26" fill="#fff" opacity=".32"/><path d="M24 189Q128 143 236 187V256H24Z" fill="#fff" opacity=".25"/>`;
}
