// The GM's Host game controls, from the tabletop tab. Requests travel
// tab -> extension service worker -> host companion (Native Messaging).

import type { PlayerInfo } from "@genesys/shared";

export type HostState = "idle" | "starting-server" | "starting-tunnel" | "ready" | "stopping";

export interface JoinRequest {
  requestId: string;
  playerName: string;
  characterName: string;
  characterClass?: string;
}

/** Mirrors HostStatus in packages/host/src/host.ts. */
export interface HostStatus {
  state: HostState;
  roomCode?: string;
  inviteUrl?: string;
  gmToken?: string;
  players: PlayerInfo[];
  requests: JoinRequest[];
  error?: string;
}

export type HostCommand =
  | { type: "host.start" | "host.stop" | "host.status" | "host.players" }
  | { type: "host.kickPlayer"; playerId: string }
  | { type: "host.approve" | "host.deny"; requestId: string };

export type HostBridgeRequest = HostCommand & { bridgeId: number };

export type HostBridgeMessage =
  | { kind: "response"; bridgeId: number; ok: boolean; result?: unknown; error?: string }
  | { kind: "event"; event: string; data: unknown };

/** Where GMs download the host companion: the newest GitHub release. */
export const HOST_DOWNLOAD_URL = "https://github.com/baysidejr/genesys-overlay/releases/latest";

/** The host companion isn't installed on this computer. The game panel shows where to get it. */
export class HostNotInstalledError extends Error {
  constructor() {
    super(`Hosting needs the Genesys host companion on this computer. Download it from ${HOST_DOWNLOAD_URL}, then try again.`);
  }
}

export class HostBridge {
  private port: chrome.runtime.Port | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private readonly listeners = new Set<(event: string, data: unknown) => void>();

  /** False outside the extension (the preview page), where hosting isn't possible. */
  static get available(): boolean {
    try {
      return typeof chrome !== "undefined" && typeof chrome.runtime?.connect === "function" && Boolean(chrome.runtime.id);
    } catch {
      return false;
    }
  }

  on(listener: (event: string, data: unknown) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  request<T = unknown>(command: HostCommand): Promise<T> {
    const port = this.connect();
    const bridgeId = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(bridgeId, { resolve: resolve as (v: unknown) => void, reject });
      port.postMessage({ ...command, bridgeId } satisfies HostBridgeRequest);
    });
  }

  private connect(): chrome.runtime.Port {
    if (this.port) return this.port;
    const port = chrome.runtime.connect({ name: "genesys-host" });
    this.port = port;
    port.onMessage.addListener((msg: HostBridgeMessage) => {
      if (msg.kind === "event") {
        for (const l of this.listeners) l(msg.event, msg.data);
        return;
      }
      const p = this.pending.get(msg.bridgeId);
      if (!p) return;
      this.pending.delete(msg.bridgeId);
      if (msg.ok) p.resolve(msg.result);
      else p.reject(msg.error === "not-installed" ? new HostNotInstalledError() : new Error(msg.error ?? "The host companion didn't answer."));
    });
    port.onDisconnect.addListener(() => {
      // The service worker restarted; the next request reconnects.
      this.port = null;
      for (const p of this.pending.values()) p.reject(new Error("Lost touch with the extension. Try again."));
      this.pending.clear();
    });
    return port;
  }
}
