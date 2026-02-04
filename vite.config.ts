import path from "path";
import { defineConfig } from "vite";

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
});
