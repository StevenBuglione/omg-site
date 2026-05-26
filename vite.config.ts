import { defineConfig, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFile } from "node:fs/promises";

const here = path.dirname(fileURLToPath(import.meta.url));
const runtimeRoot = path.resolve(here, "..");

function localDataPlugin() {
  return {
    name: "omg-local-data",
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req: any, res: any, next: any) => {
        if (!req.url?.startsWith("/local-data/")) return next();
        const relative = decodeURIComponent(req.url.replace(/^\/local-data\//, "").split("?")[0]);
        const file = path.resolve(runtimeRoot, relative);
        if (!file.startsWith(`${runtimeRoot}${path.sep}`)) {
          res.statusCode = 403;
          res.end("Forbidden");
          return;
        }
        try {
          const bytes = await readFile(file);
          res.setHeader("Content-Type", file.endsWith(".json") ? "application/json; charset=utf-8" : "text/plain; charset=utf-8");
          res.end(bytes);
        } catch {
          res.statusCode = 404;
          res.end("Not found");
        }
      });
    },
  };
}

export default defineConfig({
  base: "/omg-site/",
  plugins: [react(), localDataPlugin()],
  server: {
    fs: {
      allow: [here, path.resolve(here, "..")],
    },
  },
  build: {
    outDir: "build",
    emptyOutDir: true,
  },
});
