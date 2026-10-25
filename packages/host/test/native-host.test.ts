import { spawn } from "node:child_process";
import { PassThrough } from "node:stream";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { encodeFrame, MAX_INCOMING_BYTES, readFrames } from "../src/native-messaging";
import { serveNativeHost } from "../src/native-host";
import type { HostStatus } from "../src/host";
import { TestClient } from "./helpers";

const fake = [process.execPath, fileURLToPath(new URL("./fake-cloudflared.mjs", import.meta.url))] as [string, string];

/** Talks to a native host the way Chrome does. */
function chromeSide() {
  const toHost = new PassThrough();
  const fromHost = new PassThrough();
  const messages: Record<string, unknown>[] = [];
  readFrames(fromHost, (m) => messages.push(m as Record<string, unknown>), (e) => {
    throw e;
  });
  let id = 0;
  const request = async (body: object) => {
    const myId = ++id;
    toHost.write(encodeFrame({ id: myId, ...body }));
    for (let i = 0; i < 400; i++) {
      const res = messages.find((m) => m.id === myId);
      if (res) return res as { ok: boolean; result: unknown; error?: string };
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error(`No response to ${JSON.stringify(body)}`);
  };
  return { toHost, fromHost, messages, request };
}

describe("framing", () => {
  it("round-trips messages split across chunks", () => {
    const input = new PassThrough();
    const got: unknown[] = [];
    readFrames(input, (m) => got.push(m), () => {});
    const bytes = Buffer.concat([encodeFrame({ a: 1 }), encodeFrame({ b: "two" })]);
    for (const b of bytes) input.write(Buffer.from([b])); // one byte at a time
    expect(got).toEqual([{ a: 1 }, { b: "two" }]);
  });

  it("refuses oversized frames instead of buffering them", () => {
    const input = new PassThrough();
    const errors: Error[] = [];
    readFrames(input, () => {}, (e) => errors.push(e));
    const header = Buffer.alloc(4);
    header.writeUInt32LE(MAX_INCOMING_BYTES + 1);
    input.write(header);
    expect(errors[0]?.message).toMatch(/over the/);
  });
});

describe("native host", () => {
  it("starts, reports, approves and stops a session for the extension", async () => {
    const chrome = chromeSide();
    const done = serveNativeHost(chrome.toHost, chrome.fromHost, { cloudflared: fake, tunnel: { verify: async () => true } });

    expect((await chrome.request({ type: "host.status" })).result).toMatchObject({ state: "idle" });

    const started = (await chrome.request({ type: "host.start" })).result as HostStatus;
    expect(started.state).toBe("ready");
    expect(started.inviteUrl).toContain(".trycloudflare.com/join?room=");
    expect(started.gmToken).toBeTruthy();
    // Progress was pushed as events while starting.
    const states = chrome.messages.filter((m) => m.event === "host.state").map((m) => (m.data as HostStatus).state);
    expect(states).toEqual(["starting-server", "starting-tunnel", "ready"]);

    expect(await chrome.request({ type: "host.approve", requestId: "nope" })).toMatchObject({ ok: true, result: false });
    expect(await chrome.request({ type: "host.kickPlayer", playerId: "nope" })).toMatchObject({ ok: true, result: false });
    expect(await chrome.request({ type: "host.unknown" })).toMatchObject({ ok: false });

    expect(((await chrome.request({ type: "host.stop" })).result as HostStatus).state).toBe("idle");
    chrome.toHost.end();
    await done;
  });

  it("forwards join requests so the GM can approve them from the browser", async () => {
    const chrome = chromeSide();
    const done = serveNativeHost(chrome.toHost, chrome.fromHost, { cloudflared: fake, tunnel: { verify: async () => true } });
    const status = (await chrome.request({ type: "host.start" })).result as HostStatus;
    const roomCode = status.roomCode!;
    // The server only listens locally; find its port from the host's own invite after swapping the tunnel host.
    const port = await localPort(chrome);

    const player = await TestClient.connect(port);
    player.send({ type: "join.request", roomCode, playerName: "Robin", characterName: "Thorgar" });
    await player.next("join.pending");
    let request: { requestId: string } | undefined;
    for (let i = 0; i < 100 && !request; i++) {
      request = chrome.messages.find((m) => m.event === "host.request")?.data as { requestId: string } | undefined;
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(await chrome.request({ type: "host.approve", requestId: request!.requestId })).toMatchObject({ result: true });
    await player.next("join.accepted");

    chrome.toHost.end(); // Chrome closed the connection: the session must end.
    await done;
    expect(await player.closed()).toBe(4000);
  });
});

/** Reads the server's local port from the process's listening sockets via the status players call. */
async function localPort(chrome: ReturnType<typeof chromeSide>): Promise<number> {
  // The fake tunnel URL doesn't lead anywhere, so tests reach the server directly.
  const { result } = await chrome.request({ type: "host.status" });
  const status = result as HostStatus & { localPort?: number };
  if (!status.localPort) throw new Error("status has no localPort");
  return status.localPort;
}

describe("native host process", () => {
  it("speaks Chrome's framing on stdout, logs nothing there, and exits when Chrome disconnects", async () => {
    const script = fileURLToPath(new URL("../dist/native-host.cjs", import.meta.url));
    const child = spawn(process.execPath, [script, "chrome-extension://oompfooljghcchjdigpjicjdlncaaoki/"], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    const messages: unknown[] = [];
    let garbage = false;
    readFrames(child.stdout, (m) => messages.push(m), () => (garbage = true));

    child.stdin.write(encodeFrame({ id: 1, type: "host.status" }));
    for (let i = 0; i < 200 && !messages.length; i++) await new Promise((r) => setTimeout(r, 10));
    expect(messages[0]).toMatchObject({ id: 1, ok: true, result: { state: "idle" } });

    child.stdin.end();
    const code = await new Promise<number | null>((r) => child.once("exit", r));
    expect(code).toBe(0);
    expect(garbage).toBe(false);
  });
});
