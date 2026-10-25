// Builds the extension and zips it for sharing.
//
//   pnpm package          zip for Load unpacked, keeping the fixed extension ID
//   pnpm package:store    zip for the Chrome Web Store, without the manifest "key"
//
// The store assigns its own extension ID and doesn't accept a "key" in an
// upload. GMs who install the extension from the store need the host
// companion to accept that ID (see packages/host/README.md).
//
// There's no server to point at: games are hosted by the GM's own host
// companion, and players join with the GM's invitation link.

import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync } from "fflate";
import { buildExtension } from "./build.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const distDir = join(root, "dist");
const releaseDir = join(root, "release");
const store = process.argv.includes("--store");

await buildExtension({ mode: "production" });

const manifest = JSON.parse(readFileSync(join(distDir, "manifest.json"), "utf8"));

function collect(dir, files = {}) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) collect(path, files);
    else files[relative(distDir, path).replaceAll("\\", "/")] = readFileSync(path);
  }
  return files;
}

const files = collect(distDir);
if (store) {
  const { key: _key, ...storeManifest } = manifest;
  files["manifest.json"] = new TextEncoder().encode(JSON.stringify(storeManifest, null, 2) + "\n");
}

const zipPath = join(releaseDir, `genesys-overlay-${manifest.version}${store ? "-store" : ""}.zip`);
mkdirSync(releaseDir, { recursive: true });
writeFileSync(zipPath, zipSync(files, { level: 9 }));

const kb = (statSync(zipPath).size / 1024).toFixed(0);
console.log(`\nPackaged ${manifest.name} ${manifest.version}${store ? " for the Chrome Web Store (no key)" : ""} (${kb} KB)`);
console.log(`  files:  ${Object.keys(files).join(", ")}`);
console.log(`  zip:    ${relative(process.cwd(), zipPath)}`);
console.log("\nBump \"version\" in apps/extension/public/manifest.json before each new release.");
