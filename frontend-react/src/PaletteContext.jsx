import { createContext, useContext, useEffect, useState } from "react";

const PaletteContext = createContext(null);

export const PALETTES = [
  { id: "blue", label: "Azul", swatch: "#4f6df5" },
  { id: "purple", label: "Roxo", swatch: "#8b5cf6" },
  { id: "green", label: "Verde", swatch: "#2fa66a" },
  { id: "orange", label: "Laranja", swatch: "#f2793b" },
  { id: "pink", label: "Rosa", swatch: "#ec4899" },
  { id: "teal", label: "Turquesa", swatch: "#14b8a6" },
];

function getInitialPalette() {
  const saved = localStorage.getItem("op-palette");
  return PALETTES.some((p) => p.id === saved) ? saved : "blue";
}

export function PaletteProvider({ children }) {
  const [palette, setPalette] = useState(getInitialPalette);

  useEffect(() => {
    document.documentElement.setAttribute("data-palette", palette);
    localStorage.setItem("op-palette", palette);
  }, [palette]);

  return (
    <PaletteContext.Provider value={{ palette, setPalette }}>{children}</PaletteContext.Provider>
  );
}

export function usePalette() {
  return useContext(PaletteContext);
}
