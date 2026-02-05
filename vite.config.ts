import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";

const presetsFilePath = path.resolve(__dirname, "public", "presets.json");
const PRESETS_API = "/api/presets";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "index.html"),
        "halftone-preset": path.resolve(__dirname, "halftone-preset.html"),
        "shader-debug": path.resolve(__dirname, "shader-debug.html"),
      },
    },
  },
  plugins: [
    {
      name: "presets-file-api",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url !== PRESETS_API || req.method !== "POST") {
            next();
            return;
          }
          const chunks: Buffer[] = [];
          req.on("data", (chunk: Buffer) => chunks.push(chunk));
          req.on("end", () => {
            try {
              const body = Buffer.concat(chunks).toString("utf8");
              const dir = path.dirname(presetsFilePath);
              if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
              fs.writeFileSync(presetsFilePath, body, "utf8");
              res.statusCode = 200;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ ok: true }));
            } catch (e) {
              console.error("Write presets.json failed:", e);
              res.statusCode = 500;
              res.end(JSON.stringify({ ok: false, error: String(e) }));
            }
          });
          req.on("error", () => {
            res.statusCode = 400;
            res.end();
          });
        });
      },
    },
  ],
});
