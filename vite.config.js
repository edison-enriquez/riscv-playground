import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// `npm run build`        -> dist/ normal (para servir o subir a GitHub Pages; base relativa)
// `npm run build:single` -> dist-single/index.html con todo incrustado en un solo archivo
export default defineConfig(({ mode }) => ({
  base: "./",
  plugins: mode === "single" ? [react(), viteSingleFile()] : [react()],
  build: { outDir: mode === "single" ? "dist-single" : "dist" },
}));
