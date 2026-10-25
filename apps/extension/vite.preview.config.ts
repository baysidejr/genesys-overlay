import { defineConfig } from "vite";

// Serves dev/index.html: the dice overlay over a fake map, no Alchemy needed.
export default defineConfig({
  root: "dev",
  server: { port: 5174, strictPort: true },
});
