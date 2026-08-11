import { useState } from "react";
import { PALETTES, usePalette } from "../PaletteContext.jsx";

export default function PaletteSwitcher() {
  const { palette, setPalette } = usePalette();
  const [open, setOpen] = useState(false);
  const current = PALETTES.find((p) => p.id === palette) || PALETTES[0];

  return (
    <div className="palette-switcher">
      <button
        className="icon-btn palette-switcher-btn"
        onClick={() => setOpen((v) => !v)}
        title="Escolher paleta de cores"
      >
        <span className="palette-dot" style={{ background: current.swatch }} />
        Paleta
      </button>

      {open && (
        <div className="palette-switcher-panel">
          {PALETTES.map((p) => (
            <button
              key={p.id}
              className={`palette-option${p.id === palette ? " active" : ""}`}
              onClick={() => {
                setPalette(p.id);
                setOpen(false);
              }}
              title={p.label}
            >
              <span className="palette-dot" style={{ background: p.swatch }} />
              {p.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
