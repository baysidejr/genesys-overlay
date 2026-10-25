// Starts and stops a hosted game: the session server, then the tunnel to it.
// Used by both the command line and the browser extension (native messaging).

import { EventEmitter } from "node:events";
import type { PlayerInfo } from "@genesys/shared";
import { findCloudflared, forgetTunnelPid, rememberTunnelPid, stopStaleTunnel } from "./cloudflared";
import { GameServer, type JoinRequest } from "./server";
import { TunnelError, TunnelManager, type TunnelOptions } from "./tunnel-manager";

export type HostState = "idle" | "starting-server" | "starting-tunnel" | "ready" | "stopping";

export interface HostStatus {
  state: HostState;
  roomCode?: string;
  inviteUrl?: string;
  /** Only ever returned to the local controller (CLI or the GM's extension). */
  gmToken?: string;
  /** The server's port on 127.0.0.1, for diagnostics. */
  localPort?: number;
  players: PlayerInfo[];
  requests: JoinRequest[];
  /** Why the last start failed or the tunnel dropped, in words for the GM. */
  error?: string;
}

export interface HostOptions {
  /** Overrides the cloudflared lookup; tests pass a fake. */
  cloudflared?: TunnelOptions["command"];
  /** Skip the tunnel and invite over 127.0.0.1 only (development). */
  local?: boolean;
  tunnel?: Partial<Omit<TunnelOptions, "command" | "port">>;
}

/**
 * Events: "state" (HostStatus), "request" (JoinRequest), "request-closed"
 * (requestId), "players" (PlayerInfo[]), "tunnel-down" (message).
 */
export class Host extends EventEmitter {
  private state: HostState = "idle";
  private server: GameServer | null = null;
  private tunnel: TunnelManager | null = null;
  private inviteUrl: string | undefined;
  private error: string | undefined;
  private port: number | undefined;

  constructor(private readonly options: HostOptions = {}) {
    super();
  }

  status(): HostStatus {
    return {
      state: this.state,
      roomCode: this.server?.roomCode,
      inviteUrl: this.inviteUrl,
      gmToken: this.state === "ready" ? this.server?.gmToken : undefined,
      localPort: this.server ? this.port : undefined,
      players: this.server?.listPlayers() ?? [],
      requests: this.server?.listRequests() ?? [],
      error: this.error,
    };
  }

  async start(): Promise<HostStatus> {
    if (this.state !== "idle") return this.status();
    this.error = undefined;
    this.setState("starting-server");
    const server = new GameServer({
      events: {
        onJoinRequest: (r) => this.emit("request", r),
        onJoinRequestClosed: (id) => this.emit("request-closed", id),
        onPlayersChanged: (p) => this.emit("players", p),
      },
    });
    this.server = server;

    try {
      const port = await server.start();
      this.port = port;
      if (this.options.local) {
        this.inviteUrl = `http://127.0.0.1:${port}/join?room=${server.roomCode}`;
      } else {
        this.setState("starting-tunnel");
        stopStaleTunnel();
        const command = this.options.cloudflared ?? cloudflaredCommand();
        const tunnel = new TunnelManager({ command, port, ...this.options.tunnel });
        this.tunnel = tunnel;
        const url = await tunnel.start();
        rememberTunnelPid(tunnel.pid);
        tunnel.on("exit", () => void this.tunnelDropped());
        this.inviteUrl = `${url}/join?room=${server.roomCode}`;
      }
      this.setState("ready");
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err);
      await this.teardown();
    }
    return this.status();
  }

  async stop(): Promise<HostStatus> {
    if (this.state === "idle") return this.status();
    this.error = undefined;
    await this.teardown();
    return this.status();
  }

  approve(requestId: string): boolean {
    return this.server?.approve(requestId) ?? false;
  }

  deny(requestId: string): boolean {
    return this.server?.deny(requestId) ?? false;
  }

  kick(playerId: string): boolean {
    return this.server?.kick(playerId) ?? false;
  }

  private async tunnelDropped(): Promise<void> {
    // The public address is gone, so players can't reach the session anymore.
    // End it cleanly rather than leave a half-working game.
    this.error = "The connection to Cloudflare closed unexpectedly. Start a new session and send the new invitation.";
    await this.teardown();
    this.emit("tunnel-down", this.error);
  }

  private async teardown(): Promise<void> {
    this.setState("stopping");
    const tunnel = this.tunnel;
    const server = this.server;
    this.tunnel = null;
    this.server = null;
    this.inviteUrl = undefined;
    await server?.stop();
    await tunnel?.stop();
    forgetTunnelPid();
    this.setState("idle");
  }

  private setState(state: HostState): void {
    this.state = state;
    this.emit("state", this.status());
  }
}

function cloudflaredCommand(): TunnelOptions["command"] {
  const path = findCloudflared();
  if (!path) {
    throw new TunnelError(
      "cloudflared isn't installed. Run the host installer again, or set GENESYS_CLOUDFLARED to its location.",
      "not-found",
    );
  }
  return [path];
}
