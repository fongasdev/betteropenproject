import React from "react";
import ReactDOM from "react-dom/client";
import AuthGate from "./AuthGate.jsx";
import { ThemeProvider } from "./ThemeContext.jsx";
import { PaletteProvider } from "./PaletteContext.jsx";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ThemeProvider>
      <PaletteProvider>
        <AuthGate />
      </PaletteProvider>
    </ThemeProvider>
  </React.StrictMode>
);
