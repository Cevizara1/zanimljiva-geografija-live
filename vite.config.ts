import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { apiDevPlugin } from "./src/dev/vite-api-plugin";

export default defineConfig({
  plugins: [react(), apiDevPlugin()],
  resolve: {
    alias: {
      "@domain": fileURLToPath(new URL("./src/domain", import.meta.url)),
      "@contracts": fileURLToPath(new URL("./src/contracts", import.meta.url)),
      "@client": fileURLToPath(new URL("./src/client", import.meta.url)),
    },
  },
  build: { outDir: "dist/client", emptyOutDir: true },
  server: { port: 5173 },
});
