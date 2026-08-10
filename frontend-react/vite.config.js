import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Em dev, o Vite roda na porta 5173 e faz proxy de /api para o backend FastAPI (8811).
// Em build, o FastAPI serve o dist/ diretamente, então /api já é same-origin.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8811",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
  },
});
