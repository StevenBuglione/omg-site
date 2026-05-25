import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/omg-site/",
  plugins: [react()],
  build: {
    outDir: "build",
    emptyOutDir: true,
  },
});
