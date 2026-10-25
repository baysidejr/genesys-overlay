import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { Host } from "../src/host";
import { TunnelManager, type TunnelOptions } from "../src/tunnel-manager";
import { settle } from "./helpers";

const fake: TunnelOptions["command"] = [process.execPath, fileURLToPath(new URL("./fake-cloudflared.mjs", import.meta.url))];
const alwaysReachable = async () => true;

const running: { stop(): Promise<unknown> }[] = [];
afterEach(async () => {
  for (const r of running.splice(0)) await r.stop();
  delete process.env.FAKE_MODE;
});

const isRunning = (pid: number | undefined) => {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

describe("TunnelManager", () => {
  it("reads the address cloudflared prints and stops the process cleanly", async () => {
    const tunnel = new TunnelManager({ command: fake, port: 1234, verify: alwaysReachable });
    running.push(tunnel);
    expect(await tunnel.start()).toBe("https://brave-otter-lamp-test.trycloudflare.com");
    const pid = tunnel.pid;
    expect(isRunning(pid)).toBe(true);
    await tunnel.stop();
    await settle(100);
    expect(isRunning(pid)).toBe(false);
  });

  it("reports cloudflared exiting before the tunnel is ready", async () => {
    process.env.FAKE_MODE = "crash";
    const tunnel = new TunnelManager({ command: fake, port: 1234, verify: alwaysReachable });
    await expect(tunnel.start()).rejects.toMatchObject({ code: "exited", message: expect.stringContaining("429") });
  });

  it("gives up and cleans up when no address appears", async () => {
    process.env.FAKE_MODE = "silent";
    const tunnel = new TunnelManager({ command: fake, port: 1234, startTimeoutMs: 400, verify: alwaysReachable });
    await expect(tunnel.start()).rejects.toMatchObject({ code: "timeout" });
    expect(tunnel.pid).toBeUndefined();
  });

  it("reports a missing cloudflared", async () => {
    const tunnel = new TunnelManager({ command: ["C:/nowhere/cloudflared.exe"], port: 1234 });
    await expect(tunnel.start()).rejects.toMatchObject({ code: "not-found" });
  });

  it("stops and reports when the address never reaches this computer", async () => {
    const tunnel = new TunnelManager({ command: fake, port: 1234, verify: async () => false });
    await expect(tunnel.start()).rejects.toMatchObject({ code: "unreachable" });
    expect(tunnel.pid).toBeUndefined();
  });
});

describe("Host", () => {
  it("goes idle, starting server, starting tunnel, ready, and back to idle", async () => {
    const host = new Host({ cloudflared: fake, tunnel: { verify: alwaysReachable } });
    running.push(host);
    const states: string[] = [];
    host.on("state", (s) => states.push(s.state));

    const ready = await host.start();
    expect(ready.state).toBe("ready");
    expect(ready.inviteUrl).toBe(`https://brave-otter-lamp-test.trycloudflare.com/join?room=${ready.roomCode}`);
    expect(ready.gmToken).toBeTruthy();

    const stopped = await host.stop();
    expect(stopped).toMatchObject({ state: "idle", players: [] });
    expect(stopped.gmToken).toBeUndefined();
    expect(states).toEqual(["starting-server", "starting-tunnel", "ready", "stopping", "idle"]);
  });

  it("reports a tunnel failure and leaves nothing running", async () => {
    process.env.FAKE_MODE = "crash";
    const host = new Host({ cloudflared: fake, tunnel: { verify: alwaysReachable } });
    const status = await host.start();
    expect(status.state).toBe("idle");
    expect(status.error).toMatch(/cloudflared stopped before the tunnel was ready/);
  });

  it("ends the session when the tunnel drops", async () => {
    process.env.FAKE_MODE = "die";
    const host = new Host({ cloudflared: fake, tunnel: { verify: alwaysReachable } });
    running.push(host);
    const down = new Promise<string>((resolve) => host.once("tunnel-down", resolve));
    expect((await host.start()).state).toBe("ready");
    expect(await down).toMatch(/closed unexpectedly/);
    expect(host.status().state).toBe("idle");
  });
});
