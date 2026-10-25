// The session authority: an HTTP + WebSocket server on 127.0.0.1 that players
// reach through the Cloudflare tunnel. It holds everything in memory, binds
// each connection to a player the GM approved, checks every roll, and relays
// results to the table. It serves nothing else: no files, no proxying, no
// admin endpoints. The GM controls it only through the local host process.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { WebSocketServer, type RawData, type WebSocket } from "ws";
import {
  buildResultEvent,
  CLOSE,
  HISTORY_LIMIT,
  MAX_MESSAGE_BYTES,
  MAX_PLAYERS,
  parseClientMessage,
  PROTOCOL_VERSION,
  type ClientMessage,
  type DiceResultEvent,
  type HostMessage,
  type PlayerInfo,
} from "@genesys/shared";
import { randomRoomCode, randomToken, RateLimiter, sameSecret } from "./security";
import { landingPage } from "./landing";

export interface JoinRequest {
  requestId: string;
  playerName: string;
  characterName: string;
  characterClass?: string;
}

export interface GameServerEvents {
  /** A player asked to join; the GM approves or denies it. */
  onJoinRequest?(request: JoinRequest): void;
  /** A pending request went away (player left, timed out, approved or denied). */
  onJoinRequestClosed?(requestId: string): void;
  onPlayersChanged?(players: PlayerInfo[]): void;
}

export interface GameServerOptions {
  maxPlayers?: number;
  /** How often to ping clients; a client that misses one ping is dropped. */
  heartbeatMs?: number;
  /** How long a join request waits for the GM before it's turned away. */
  pendingTimeoutMs?: number;
  maxPending?: number;
  now?: () => Date;
  events?: GameServerEvents;
}

interface Player {
  playerId: string;
  token: string;
  playerName: string;
  characterName: string;
  characterClass?: string;
  isGm: boolean;
  conn: Conn | null;
  /** Recent client event IDs, to drop resent rolls. */
  seen: string[];
  rolls: RateLimiter;
}

interface Pending extends JoinRequest {
  conn: Conn;
  timer: ReturnType<typeof setTimeout>;
}

interface Conn {
  ws: WebSocket;
  alive: boolean;
  player: Player | null;
  pendingId: string | null;
  messages: RateLimiter;
}

const SEEN_LIMIT = 50;

export class GameServer {
  readonly roomCode = randomRoomCode();
  /** Handed only to the GM's own extension, over the local native messaging channel. */
  readonly gmToken = randomToken();

  private readonly http: Server;
  private readonly wss: WebSocketServer;
  private readonly conns = new Set<Conn>();
  private readonly players = new Map<string, Player>();
  private readonly pending = new Map<string, Pending>();
  private history: DiceResultEvent[] = [];
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private stopped = false;

  private readonly maxPlayers: number;
  private readonly heartbeatMs: number;
  private readonly pendingTimeoutMs: number;
  private readonly maxPending: number;
  private readonly now: () => Date;
  private readonly events: GameServerEvents;

  constructor(options: GameServerOptions = {}) {
    this.maxPlayers = options.maxPlayers ?? MAX_PLAYERS;
    this.heartbeatMs = options.heartbeatMs ?? 15_000;
    this.pendingTimeoutMs = options.pendingTimeoutMs ?? 120_000;
    this.maxPending = options.maxPending ?? 5;
    this.now = options.now ?? (() => new Date());
    this.events = options.events ?? {};

    this.http = createServer((req, res) => this.handleHttp(req, res));
    this.wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });
    this.http.on("upgrade", (req, socket, head) => {
      const path = new URL(req.url ?? "/", "http://localhost").pathname;
      // Players, pending requests and a little slack for reconnects.
      if (path !== "/ws" || this.stopped || this.conns.size >= this.maxPlayers + this.maxPending + 2) {
        socket.end("HTTP/1.1 503 Service Unavailable\r\n\r\n");
        return;
      }
      this.wss.handleUpgrade(req, socket, head, (ws) => this.accept(ws));
    });
  }

  /** Listens on 127.0.0.1 only, on a free port. Resolves to the port. */
  start(port = 0): Promise<number> {
    return new Promise((resolve, reject) => {
      this.http.once("error", reject);
      this.http.listen(port, "127.0.0.1", () => {
        this.http.off("error", reject);
        this.heartbeat = setInterval(() => this.beat(), this.heartbeatMs);
        resolve((this.http.address() as AddressInfo).port);
      });
    });
  }

  /** Ends the session for everyone, forgets all state and closes the server. */
  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    if (this.heartbeat) clearInterval(this.heartbeat);
    for (const p of this.pending.values()) clearTimeout(p.timer);
    for (const conn of this.conns) {
      this.send(conn, { type: "session.ended", reason: "stopped" });
      conn.ws.close(CLOSE.sessionEnded, "Session ended");
    }
    this.pending.clear();
    this.players.clear();
    this.history = [];
    // Give the close frames a moment, then drop anything still open.
    await new Promise((r) => setTimeout(r, 100));
    for (const conn of this.conns) conn.ws.terminate();
    this.conns.clear();
    await new Promise<void>((resolve) => this.http.close(() => resolve()));
    this.http.closeAllConnections?.();
  }

  listPlayers(): PlayerInfo[] {
    return [...this.players.values()].map(info);
  }

  listRequests(): JoinRequest[] {
    return [...this.pending.values()].map(({ requestId, playerName, characterName, characterClass }) => ({
      requestId,
      playerName,
      characterName,
      characterClass,
    }));
  }

  approve(requestId: string): boolean {
    const req = this.pending.get(requestId);
    if (!req) return false;
    this.closeRequest(req);
    if (this.playerCount() >= this.maxPlayers) {
      this.refuse(req.conn, "full");
      return false;
    }
    const player = this.addPlayer(req, false);
    this.admit(req.conn, player);
    return true;
  }

  deny(requestId: string): boolean {
    const req = this.pending.get(requestId);
    if (!req) return false;
    this.closeRequest(req);
    this.refuse(req.conn, "denied");
    return true;
  }

  /** Removes a player; their saved identity stops working, so they can't rejoin without asking again. */
  kick(playerId: string): boolean {
    const player = this.players.get(playerId);
    if (!player || player.isGm) return false;
    this.players.delete(playerId);
    if (player.conn) {
      this.send(player.conn, { type: "join.denied", reason: "kicked" });
      player.conn.player = null;
      player.conn.ws.close(CLOSE.kicked, "Removed by GM");
    }
    this.presence();
    return true;
  }

  // ---------- HTTP ----------

  private handleHttp(req: IncomingMessage, res: ServerResponse): void {
    const url = new URL(req.url ?? "/", "http://localhost");
    const headers = {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    };
    if (req.method === "GET" && url.pathname === "/ping") {
      res.writeHead(200, { ...headers, "Content-Type": "text/plain" }).end("genesys-host");
    } else if (req.method === "GET" && url.pathname === "/join") {
      res
        .writeHead(200, {
          ...headers,
          "Content-Type": "text/html; charset=utf-8",
          "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:",
        })
        .end(landingPage());
    } else {
      res.writeHead(404, { ...headers, "Content-Type": "text/plain" }).end("Not found");
    }
  }

  // ---------- WebSocket ----------

  private accept(ws: WebSocket): void {
    const conn: Conn = { ws, alive: true, player: null, pendingId: null, messages: new RateLimiter(20, 10) };
    this.conns.add(conn);
    ws.on("pong", () => (conn.alive = true));
    ws.on("message", (data, isBinary) => this.onMessage(conn, data, isBinary));
    ws.on("close", () => this.onClose(conn));
    ws.on("error", () => ws.terminate());
  }

  private onMessage(conn: Conn, data: RawData, isBinary: boolean): void {
    if (!conn.messages.take()) {
      return this.error(conn, "rate-limited", "Too many messages. Slow down.");
    }
    if (isBinary) return this.error(conn, "bad-message", "Messages must be JSON text.");
    const msg = parseClientMessage(data.toString());
    if (!msg) return this.error(conn, "bad-message", "That message isn't something this game understands.");

    if (msg.type === "dice.roll") return this.onRoll(conn, msg);
    if (conn.player || conn.pendingId) return this.error(conn, "bad-message", "Already joined.");
    if (msg.roomCode !== this.roomCode) return this.refuse(conn, "bad-room");

    switch (msg.type) {
      case "join.request":
        return this.onJoinRequest(conn, msg);
      case "join.resume": {
        const player = this.players.get(msg.playerId);
        if (!player || !sameSecret(player.token, msg.token)) return this.refuse(conn, "bad-token");
        return this.admit(conn, player);
      }
      case "join.gm": {
        if (!sameSecret(this.gmToken, msg.gmToken)) return this.refuse(conn, "bad-token");
        const gm = [...this.players.values()].find((p) => p.isGm);
        if (gm) {
          gm.playerName = msg.playerName;
          gm.characterName = msg.characterName;
          gm.characterClass = msg.characterClass;
        }
        return this.admit(conn, gm ?? this.addPlayer(msg, true));
      }
    }
  }

  private onJoinRequest(conn: Conn, msg: Extract<ClientMessage, { type: "join.request" }>): void {
    if (this.playerCount() >= this.maxPlayers || this.pending.size >= this.maxPending) {
      return this.refuse(conn, "full");
    }
    const requestId = randomToken(9);
    const req: Pending = {
      requestId,
      playerName: msg.playerName,
      characterName: msg.characterName,
      characterClass: msg.characterClass,
      conn,
      timer: setTimeout(() => {
        if (!this.pending.has(requestId)) return;
        this.closeRequest(req);
        this.refuse(conn, "denied");
      }, this.pendingTimeoutMs),
    };
    this.pending.set(requestId, req);
    conn.pendingId = requestId;
    this.send(conn, { type: "join.pending" });
    this.events.onJoinRequest?.(this.listRequests().find((r) => r.requestId === requestId)!);
  }

  private onRoll(conn: Conn, msg: Extract<ClientMessage, { type: "dice.roll" }>): void {
    const player = conn.player;
    if (!player) return this.error(conn, "not-joined", "Join the game before rolling.");
    if (player.seen.includes(msg.clientEventId)) {
      return this.error(conn, "duplicate", "That roll was already shared.");
    }
    if (!player.rolls.take()) return this.error(conn, "rate-limited", "Rolling too fast. Wait a moment.");
    player.seen.push(msg.clientEventId);
    if (player.seen.length > SEEN_LIMIT) player.seen.shift();

    // Identity comes from the approved player record, never from the message.
    const event = buildResultEvent(msg, info(player), randomToken(12), this.now());
    this.history.push(event);
    if (this.history.length > HISTORY_LIMIT) this.history.shift();

    this.send(conn, { type: "dice.ack", clientEventId: msg.clientEventId, eventId: event.eventId });
    for (const other of this.conns) {
      if (other !== conn && other.player) this.send(other, event);
    }
  }

  private onClose(conn: Conn): void {
    this.conns.delete(conn);
    if (conn.pendingId) {
      const req = this.pending.get(conn.pendingId);
      if (req) this.closeRequest(req);
    }
    if (conn.player && conn.player.conn === conn) {
      conn.player.conn = null;
      this.presence();
    }
  }

  private beat(): void {
    for (const conn of this.conns) {
      if (!conn.alive) {
        conn.ws.terminate();
        continue;
      }
      conn.alive = false;
      conn.ws.ping();
    }
  }

  // ---------- Helpers ----------

  private addPlayer(who: Omit<JoinRequest, "requestId">, isGm: boolean): Player {
    const player: Player = {
      playerId: randomToken(9),
      token: randomToken(),
      playerName: who.playerName,
      characterName: who.characterName,
      characterClass: who.characterClass,
      isGm,
      conn: null,
      seen: [],
      rolls: new RateLimiter(5, 1),
    };
    this.players.set(player.playerId, player);
    return player;
  }

  /** Binds a connection to a player, replacing any older connection they had. */
  private admit(conn: Conn, player: Player): void {
    if (player.conn && player.conn !== conn) {
      const old = player.conn;
      old.player = null;
      old.ws.close(CLOSE.replaced, "Connected from somewhere else");
    }
    player.conn = conn;
    conn.player = player;
    conn.pendingId = null;
    this.send(conn, {
      type: "join.accepted",
      playerId: player.playerId,
      token: player.token,
      isGm: player.isGm,
      players: this.listPlayers(),
      history: this.history,
    });
    this.presence();
  }

  private refuse(conn: Conn, reason: Extract<HostMessage, { type: "join.denied" }>["reason"]): void {
    this.send(conn, { type: "join.denied", reason });
    conn.ws.close(CLOSE.denied, "Not admitted");
  }

  private closeRequest(req: Pending): void {
    clearTimeout(req.timer);
    this.pending.delete(req.requestId);
    req.conn.pendingId = null;
    this.events.onJoinRequestClosed?.(req.requestId);
  }

  private playerCount(): number {
    let n = 0;
    for (const p of this.players.values()) if (!p.isGm) n++;
    return n;
  }

  private presence(): void {
    const players = this.listPlayers();
    for (const conn of this.conns) if (conn.player) this.send(conn, { type: "presence", players });
    this.events.onPlayersChanged?.(players);
  }

  private error(conn: Conn, code: Extract<HostMessage, { type: "error" }>["code"], message: string): void {
    this.send(conn, { type: "error", code, message });
  }

  private send(conn: Conn, msg: HostMessage): void {
    if (conn.ws.readyState === conn.ws.OPEN) conn.ws.send(JSON.stringify({ ...msg, version: PROTOCOL_VERSION }));
  }
}

function info(p: Player): PlayerInfo {
  return {
    playerId: p.playerId,
    playerName: p.playerName,
    characterName: p.characterName,
    ...(p.characterClass ? { characterClass: p.characterClass } : {}),
    isGm: p.isGm,
    online: p.conn !== null,
  };
}
