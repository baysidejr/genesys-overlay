// The process Chrome starts when the GM's extension connects to
// "com.genesys_overlay.host". It's the only way to control a hosted game:
// the commands arrive over this private local channel, never over the
// tunnel. When Chrome disconnects (the extension or browser closes), the
// session ends and the tunnel is shut down.
//
// stdout carries Native Messaging frames only. All logging goes to stderr.

import type { Readable, Writable } from "node:stream";
import { Host, type HostOptions } from "./host";
import { readFrames, writeFrame } from "./native-messaging";

export const NATIVE_HOST_NAME = "com.genesys_overlay.host";

export type NativeRequest =
  | { id: number; type: "host.start" | "host.stop" | "host.status" | "host.players" }
  | { id: number; type: "host.kickPlayer"; playerId: string }
  | { id: number; type: "host.approve" | "host.deny"; requestId: string };

export type NativeEvent = "host.state" | "host.request" | "host.requestClosed" | "host.players" | "host.tunnelDown";

const isRequest = (m: unknown): m is NativeRequest => {
  const r = m as NativeRequest;
  return typeof r === "object" && r !== null && typeof r.id === "number" && typeof r.type === "string";
};

/** Serves one extension connection. Resolves when the extension disconnects and the session has ended. */
export function serveNativeHost(input: Readable, output: Writable, options: HostOptions = {}): Promise<void> {
  const host = new Host(options);
  const send = (message: unknown) => writeFrame(output, message);
  const emit = (event: NativeEvent, data: unknown) => send({ event, data });

  host.on("state", (s) => emit("host.state", s));
  host.on("request", (r) => emit("host.request", r));
  host.on("request-closed", (id) => emit("host.requestClosed", id));
  host.on("players", (p) => emit("host.players", p));
  host.on("tunnel-down", (message) => emit("host.tunnelDown", message));

  const handle = async (req: NativeRequest): Promise<unknown> => {
    switch (req.type) {
      case "host.start":
        return host.start();
      case "host.stop":
        return host.stop();
      case "host.status":
        return host.status();
      case "host.players":
        return host.status().players;
      case "host.kickPlayer":
        return host.kick(String(req.playerId));
      case "host.approve":
        return host.approve(String(req.requestId));
      case "host.deny":
        return host.deny(String(req.requestId));
      default:
        throw new Error(`Unknown command ${(req as { type: string }).type}`);
    }
  };

  return new Promise((resolve) => {
    let closing = false;
    const close = async () => {
      if (closing) return;
      closing = true;
      await host.stop();
      resolve();
    };

    readFrames(
      input,
      (message) => {
        if (!isRequest(message)) return send({ id: null, ok: false, error: "Malformed request" });
        handle(message).then(
          (result) => send({ id: message.id, ok: true, result }),
          (err: unknown) => send({ id: message.id, ok: false, error: err instanceof Error ? err.message : String(err) }),
        );
      },
      (err) => {
        console.error(`native host: ${err.message}`);
        void close();
      },
    );
    input.on("end", () => void close());
    input.on("close", () => void close());
  });
}

// Entry point when Chrome launches us: Chrome passes the calling extension's
// origin as the first argument. Keep stdout clean of anything but frames.
if (typeof require !== "undefined" && require.main === module) {
  console.log = console.info = console.warn = (...args: unknown[]) => console.error(...args);
  void serveNativeHost(process.stdin, process.stdout).then(() => process.exit(0));
}
