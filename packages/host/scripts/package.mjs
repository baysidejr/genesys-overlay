// Builds the host and zips what a GM needs to install it, for GitHub Releases.
//
//   pnpm package:host
//
// The zip holds the installer and uninstaller, the two bundled host scripts
// and a README for GMs. install-host.ps1 finds the host scripts next to it.

import { readFileSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { zipSync } from "fflate";

const root = fileURLToPath(new URL("..", import.meta.url));
const releaseDir = join(root, "release");
const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

execFileSync(process.execPath, [join(root, "scripts", "build.mjs")], { stdio: "inherit" });

const installer = readFileSync(join(root, "scripts", "install-host.ps1"), "utf8");
if (/^\$StoreExtensionId = ''/m.test(installer)) {
  console.warn(
    "\nWarning: $StoreExtensionId in install-host.ps1 is empty, so GMs who installed the extension from the Chrome Web Store won't be able to host. Fill it in before publishing this release.",
  );
}

// Zip path -> source file. Windows line endings, since GMs may open these in Notepad.
const files = {
  "install-host.ps1": "scripts/install-host.ps1",
  "uninstall-host.ps1": "scripts/uninstall-host.ps1",
  "README.txt": "scripts/release-readme.txt",
  "native-host.cjs": "dist/native-host.cjs",
  "cli.cjs": "dist/cli.cjs",
};
const crlf = (text) => text.replace(/\r?\n/g, "\r\n");
const entries = Object.fromEntries(
  Object.entries(files).map(([name, source]) => {
    const raw = readFileSync(join(root, source));
    return [name, /\.(ps1|txt)$/.test(name) ? new TextEncoder().encode(crlf(raw.toString("utf8"))) : raw];
  }),
);

const folder = `genesys-host-${version}`;
const zipPath = join(releaseDir, `${folder}.zip`);
mkdirSync(releaseDir, { recursive: true });
// Everything sits in one folder, so unzipping doesn't scatter files.
writeFileSync(zipPath, zipSync(Object.fromEntries(Object.entries(entries).map(([name, data]) => [`${folder}/${name}`, data])), { level: 9 }));

const kb = (statSync(zipPath).size / 1024).toFixed(0);
console.log(`\nPackaged the host companion ${version} (${kb} KB)`);
console.log(`  files:  ${Object.keys(files).join(", ")}`);
console.log(`  zip:    ${relative(process.cwd(), zipPath)}`);
console.log('\nBump "version" in packages/host/package.json before each new release, and attach the zip to a GitHub release.');
