// Bundles the host into self-contained Node scripts in dist/.
//   dist/cli.cjs          command-line host
//   dist/native-host.cjs  the process Chrome starts for the extension

import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

await build({
  absWorkingDir: root,
  entryPoints: { cli: "src/cli.ts", "native-host": "src/native-host.ts" },
  outdir: "dist",
  outExtension: { ".js": ".cjs" },
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  // ws optionally uses native addons; the pure-JS fallback is fine here.
  external: ["bufferutil", "utf-8-validate"],
  logLevel: "warning",
});
console.log("Built dist/cli.cjs and dist/native-host.cjs");
