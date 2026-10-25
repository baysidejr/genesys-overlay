// Runs `cloudflared tunnel --url http://127.0.0.1:<port>` as a managed child
// process and reads the public trycloudflare.com address it prints.
//
// Quick Tunnels need no Cloudflare account, but Cloudflare treats them as a
// testing feature: the address changes every time and isn't guaranteed for
// long sessions.

import { spawn, type ChildProcess } from "node:child_process";
import { lookup as dnsLookup } from "node:dns/promises";
import { EventEmitter } from "node:events";
import { get as httpsGet } from "node:https";
import type { LookupFunction } from "node:net";

/** cloudflared prints the address in a banner; api.trycloudflare.com is its own API, not ours. */
const TUNNEL_URL = /https:\/\/(?!api\.)[a-z0-9-]+\.trycloudflare\.com\b/;

export class TunnelError extends Error {
  constructor(
    message: string,
    readonly code: "not-found" | "exited" | "timeout" | "unreachable",
  ) {
    super(message);
  }
}

export interface TunnelOptions {
  /** cloudflared, plus any arguments that must come first (tests pass a fake). */
  command: [string, ...string[]];
  port: number;
  /** How long to wait for cloudflared to print its address. */
  startTimeoutMs?: number;
  /** How long to keep checking that the address really reaches our server. */
  verifyTimeoutMs?: number;
  /** Checks the public address; defaults to fetching /ping until it answers. */
  verify?: (url: string, timeoutMs: number) => Promise<boolean>;
}

/**
 * Emits "exit" (code) if cloudflared stops on its own after the tunnel was up.
 */
export class TunnelManager extends EventEmitter {
  private child: ChildProcess | null = null;
  private stopping = false;
  url: string | null = null;

  constructor(private readonly options: TunnelOptions) {
    super();
  }

  get pid(): number | undefined {
    return this.child?.pid;
  }

  async start(): Promise<string> {
    const [exe, ...prefix] = this.options.command;
    const args = [...prefix, "tunnel", "--no-autoupdate", "--url", `http://127.0.0.1:${this.options.port}`];
    const child = spawn(exe, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    this.child = child;

    const url = await new Promise<string>((resolve, reject) => {
      // Keep the last lines for error messages; cloudflared logs to stderr.
      const recent: string[] = [];
      const timer = setTimeout(() => {
        fail(new TunnelError(`cloudflared didn't open a tunnel within ${(this.options.startTimeoutMs ?? 30_000) / 1000}s.`, "timeout"));
      }, this.options.startTimeoutMs ?? 30_000);

      // The address is printed first; it only works once cloudflared has
      // registered a connection with Cloudflare's edge.
      let found: string | null = null;
      let registered = false;
      const onData = (chunk: Buffer) => {
        for (const line of chunk.toString().split(/\r?\n/)) {
          if (line.trim()) recent.push(line.trim());
          if (recent.length > 8) recent.shift();
          found ??= line.match(TUNNEL_URL)?.[0] ?? null;
          registered ||= line.includes("Registered tunnel connection");
          if (found && registered) {
            cleanup();
            resolve(found);
            return;
          }
        }
      };
      const onError = (err: NodeJS.ErrnoException) => {
        fail(
          err.code === "ENOENT"
            ? new TunnelError(`cloudflared wasn't found at ${exe}.`, "not-found")
            : new TunnelError(`cloudflared couldn't start: ${err.message}`, "exited"),
        );
      };
      const onExit = (code: number | null) => {
        const detail = recent.length ? ` Last output: ${recent.slice(-3).join(" | ")}` : "";
        fail(new TunnelError(`cloudflared stopped before the tunnel was ready (exit ${code}).${detail}`, "exited"));
      };
      const cleanup = () => {
        clearTimeout(timer);
        child.stdout?.off("data", onData);
        child.stderr?.off("data", onData);
        child.off("error", onError);
        child.off("exit", onExit);
      };
      const fail = (err: TunnelError) => {
        cleanup();
        // Only report the failure once cloudflared is really gone.
        void this.stop().then(() => reject(err));
      };

      child.stdout?.on("data", onData);
      child.stderr?.on("data", onData);
      child.once("error", onError);
      child.once("exit", onExit);
    });

    // Drain output so the pipes never fill up and block cloudflared.
    child.stdout?.resume();
    child.stderr?.resume();
    child.once("exit", (code) => {
      this.child = null;
      if (!this.stopping) this.emit("exit", code);
    });

    const verify = this.options.verify ?? probe;
    if (!(await verify(url, this.options.verifyTimeoutMs ?? 45_000))) {
      await this.stop();
      throw new TunnelError(`The tunnel opened at ${url} but doesn't reach this computer yet. Try again.`, "unreachable");
    }
    this.url = url;
    return url;
  }

  /** Stops cloudflared and waits for it to exit (forcing it after 5 seconds). */
  async stop(): Promise<void> {
    const child = this.child;
    this.url = null;
    if (!child || child.exitCode !== null) {
      this.child = null;
      return;
    }
    this.stopping = true;
    await new Promise<void>((resolve) => {
      const force = setTimeout(() => {
        child.kill("SIGKILL");
        resolve();
      }, 5000);
      child.once("exit", () => {
        clearTimeout(force);
        resolve();
      });
      child.kill();
    });
    this.child = null;
    this.stopping = false;
  }
}

/**
 * Requests <url>/ping until our server answers through the tunnel.
 *
 * A new quick tunnel's name isn't in DNS for roughly ten seconds, and any
 * lookup before then gets a "not found" that resolvers (Windows, the ISP,
 * public ones) cache for minutes, which would lock this computer out of its
 * own game. So the check never looks the name up: it connects to Cloudflare's
 * edge (the address trycloudflare.com itself resolves to) and names the
 * tunnel in TLS and the Host header. Once that works, the edge can route the
 * name, and a short pause later its DNS record is live.
 */
export async function probe(url: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  const hostname = new URL(url).hostname;
  const edge = await dnsLookup(hostname.split(".").slice(-2).join("."), { family: 4 }).then(
    (r) => r.address,
    () => null,
  );
  // Without an edge address, fall back to ordinary DNS after the record should exist.
  if (!edge) await sleep(12_000);
  const lookup: LookupFunction | undefined = edge
    ? (_name, options, callback) => (options.all ? callback(null, [{ address: edge, family: 4 }]) : callback(null, edge, 4))
    : undefined;

  while (Date.now() < deadline) {
    if (await pingOnce(url, lookup)) {
      await sleep(DNS_SETTLE_MS);
      return true;
    }
    await sleep(1000);
  }
  return false;
}

/** Pause after the edge routes the tunnel, so its DNS record is live before anyone looks it up. */
const DNS_SETTLE_MS = 4000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function pingOnce(url: string, lookup: LookupFunction | undefined): Promise<boolean> {
  return new Promise((resolve) => {
    const req = httpsGet(`${url}/ping`, { lookup, timeout: 5000 }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c: string) => (body += c));
      res.on("end", () => resolve(res.statusCode === 200 && body === "genesys-host"));
    });
    req.on("timeout", () => req.destroy());
    req.on("error", (err) => {
      if (process.env.GENESYS_DEBUG) console.error(`tunnel check: ${err.message}`);
      resolve(false);
    });
  });
}
