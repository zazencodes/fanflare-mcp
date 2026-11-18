export type Paint = {
  fur: string;
  light: string;
  dark: string;
  accent: string;
};
const colours = [
  "#b8a3ef",
  "#eaa16e",
  "#91bdd8",
  "#d6a4c1",
  "#92b9a4",
  "#d6c48a",
  "#7d8cc6",
  "#c7a5de",
  "#e6b3a1",
  "#91caca",
];
export function palette(id: string): Paint {
  const names = [
    "palette-starter",
    "palette-apricot",
    "palette-cloud",
    "palette-rose",
    "palette-sage",
    "palette-honey",
    "palette-dusk",
    "palette-lilac",
    "palette-peach",
    "palette-tide",
  ];
  const fur = colours[Math.max(0, names.indexOf(id))];
  const accents = [
    "#7960b9",
    "#bd724b",
    "#608ba8",
    "#a76f92",
    "#628d76",
    "#ab8d42",
    "#535f9a",
    "#9470b0",
    "#bd8577",
    "#5f9d9c",
  ];
  return {
    fur,
    light: "#fff3e6",
    dark: "#303357",
    accent: accents[Math.max(0, names.indexOf(id))],
  };
}
