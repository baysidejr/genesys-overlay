// Finding cloudflared, and cleaning up after a host that was killed hard.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const EXE = process.platform === "win32" ? "cloudflared.exe" : "cloudflared";

/**
 * Where to find cloudflared, in order: GENESYS_CLOUDFLARED, next to the host
 * (where the installer puts it), then the PATH. Null if it isn't anywhere.
 */
export function findCloudflared(hostDir = dirname(process.argv[1] ?? ".")): string | null {
  const fromEnv = process.env.GENESYS_CLOUDFLARED;
  if (fromEnv) return existsSync(fromEnv) ? fromEnv : null;
  const beside = join(hostDir, EXE);
  if (existsSync(beside)) return beside;
  try {
    const cmd = process.platform === "win32" ? "where" : "which";
    const found = execFileSync(cmd, ["cloudflared"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return found.split(/\r?\n/)[0]?.trim() || null;
  } catch {
    return null;
  }
}

const PID_FILE = join(tmpdir(), "genesys-host-cloudflared.pid");

/**
 * Windows doesn't stop child processes when their parent is killed, so a
 * crashed host could leave a tunnel running. We record cloudflared's PID and,
 * on the next start, stop it if that PID is still a cloudflared process.
 */
export function stopStaleTunnel(): void {
  if (!existsSync(PID_FILE)) return;
  const pid = Number(readFileSync(PID_FILE, "utf8"));
  rmSync(PID_FILE, { force: true });
  if (!Number.isInteger(pid) || pid <= 0 || !isCloudflared(pid)) return;
  try {
    process.kill(pid);
  } catch {
    // Already gone.
  }
}

export function rememberTunnelPid(pid: number | undefined): void {
  if (pid) writeFileSync(PID_FILE, String(pid));
}

export function forgetTunnelPid(): void {
  rmSync(PID_FILE, { force: true });
}

function isCloudflared(pid: number): boolean {
  try {
    if (process.platform === "win32") {
      const out = execFileSync("tasklist", ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"], { encoding: "utf8" });
      return out.toLowerCase().includes("cloudflared");
    }
    return execFileSync("ps", ["-p", String(pid), "-o", "comm="], { encoding: "utf8" }).includes("cloudflared");
  } catch {
    return false;
  }
}
