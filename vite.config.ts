import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" keeps every asset URL relative, so dist/ works at an IPFS gateway subpath or an ENS name.
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: { outDir: "dist", emptyOutDir: true, chunkSizeWarningLimit: 1500 },
});
