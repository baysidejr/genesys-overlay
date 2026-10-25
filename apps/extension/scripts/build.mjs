// Builds the extension into dist/. Chrome loads each script on its own, so
// each is a separate self-contained bundle (MV3 can't load remote code).
//   content.js     the overlay, on the tabletop page
//   invite.js      saves the GM's invitation, on the tunnel's /join page
//   background.js  service worker relaying Host game controls to the host companion
//
//   node scripts/build.mjs [--watch] [--mode development]

import { fileURLToPath } from "node:url";
import { build } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));

const ENTRIES = [
  { name: "content", format: "iife" },
  { name: "invite", format: "iife" },
  { name: "background", format: "es" },
];

export async function buildExtension({ mode = "production", watch = false } = {}) {
  for (const [i, entry] of ENTRIES.entries()) {
    await build({
      root,
      mode,
      configFile: false,
      logLevel: "warn",
      // Only the first build empties dist and copies public/ (manifest, icons).
      publicDir: i === 0 ? "public" : false,
      define: { "process.env.NODE_ENV": JSON.stringify(mode) },
      build: {
        outDir: "dist",
        emptyOutDir: i === 0,
        sourcemap: mode === "development",
        minify: mode !== "development",
        watch: watch ? {} : null,
        lib: {
          entry: `src/${entry.name}.ts`,
          name: `Genesys_${entry.name}`,
          formats: [entry.format],
          fileName: () => `${entry.name}.js`,
        },
      },
    });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const mode = process.argv.includes("--mode") ? process.argv[process.argv.indexOf("--mode") + 1] : "production";
  await buildExtension({ mode, watch: process.argv.includes("--watch") });
  if (!process.argv.includes("--watch")) console.log("Built dist/ (content.js, invite.js, background.js)");
}
