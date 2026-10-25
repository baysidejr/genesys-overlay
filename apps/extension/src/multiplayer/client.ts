// A player's connection to the GM's hosted game. Handles joining, waiting for
// the GM's approval, reconnecting with backoff after a dropped connection,
// and showing each roll once even if it arrives again in history.
//
// Uses only the standard WebSocket API, so it runs in the extension and in
// Node tests alike.

import {
  CLOSE,
  isConsistentResult,
  parseInvite,
  PROTOCOL_VERSION,
  type ClientMessage,
  type DicePool,
  type DiceResultEvent,
  type HostEnvelope,
  type PlayerInfo,
  type RolledDie,
} from "@genesys/shared";

export interface Identity {
  playerName: string;
  characterName: string;
  characterClass?: string;
}

/** What the client needs to rejoin as the same player after a reload. Session-scoped. */
export interface ResumeTicket {
  invite: string;
  playerId: string;
  token: string;
  identity: Identity;
  isGm: boolean;
}

export type GameState =
  | { status: "idle" }
  | { status: "connecting" }
  | { status: "waiting" }
  | { status: "connected"; me: PlayerInfo; players: PlayerInfo[]; roomCode: string }
  | { status: "reconnecting"; attempt: number; roomCode: string }
  /** Terminal: the game is over for this client until it joins again. */
  | { status: "ended"; message: string };

export interface GameClientOptions {
  onState(state: GameState): void;
  /** A roll from someone else. `fromHistory` is true for rolls made before we joined. */
  onResult(event: DiceResultEvent, fromHistory: boolean): void;
  /** A problem worth telling the player about that doesn't end the game. */
  onNotice?(message: string): void;
  onTicket?(ticket: ResumeTicket | null): void;
  WebSocketImpl?: typeof WebSocket;
  backoff?: { baseMs: number; maxMs: number; maxAttempts: number };
}

const DENIED: Record<string, string> = {
  denied: "The GM didn't let you in this time. Ask them, then try joining again.",
  full: "That game is full.",
  "bad-room": "That invitation doesn't match the GM's current game. Ask for a fresh link.",
  "bad-token": "This game session is no longer running. Ask your GM for a new invitation.",
  kicked: "The GM removed you from the game.",
};

export class GameClient {
  private ws: WebSocket | null = null;
  private state: GameState = { status: "idle" };
  private invite: ReturnType<typeof parseInvite> = null;
  private inviteUrl = "";
  private identity: Identity | null = null;
  private gmToken: string | null = null;
  private ticket: ResumeTicket | null = null;
  private attempt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly seen = new Set<string>();
  private readonly WS: typeof WebSocket;
  private readonly backoff: NonNullable<GameClientOptions["backoff"]>;

  constructor(private readonly options: GameClientOptions) {
    this.WS = options.WebSocketImpl ?? WebSocket;
    this.backoff = options.backoff ?? { baseMs: 1000, maxMs: 30_000, maxAttempts: 8 };
  }

  get current(): GameState {
    return this.state;
  }

  /** Asks to join; the GM has to approve. Returns an error message if the invite is unusable. */
  join(inviteUrl: string, identity: Identity): string | null {
    return this.start(inviteUrl, identity, null, null);
  }

  /** The GM's own extension joins its game with the token the host gave it locally. */
  joinAsGm(inviteUrl: string, gmToken: string, identity: Identity): string | null {
    return this.start(inviteUrl, identity, gmToken, null);
  }

  /** Rejoins as the same player after a page reload. */
  resume(ticket: ResumeTicket): string | null {
    return this.start(ticket.invite, ticket.identity, null, ticket);
  }

  /** Shares a finished roll. Returns false if we aren't connected, so it wasn't sent. */
  sendRoll(roll: { clientEventId: string; dicePool: DicePool; dice: RolledDie[]; label?: string }): boolean {
    if (this.state.status !== "connected") return false;
    return this.send({ type: "dice.roll", ...roll });
  }

  leave(): void {
    this.stopRetrying();
    this.ticket = null;
    this.options.onTicket?.(null);
    const ws = this.ws;
    this.ws = null;
    ws?.close(1000, "Left the game");
    this.setState({ status: "idle" });
  }

  // ---------- Connection ----------

  private start(inviteUrl: string, identity: Identity, gmToken: string | null, ticket: ResumeTicket | null) {
    const invite = parseInvite(inviteUrl);
    if (!invite) return "That doesn't look like an invitation link. Paste the whole link your GM sent.";
    this.leaveQuietly();
    this.invite = invite;
    this.inviteUrl = inviteUrl;
    this.identity = identity;
    this.gmToken = gmToken;
    this.ticket = ticket;
    this.attempt = 0;
    this.seen.clear();
    this.setState(ticket ? { status: "reconnecting", attempt: 0, roomCode: invite.roomCode } : { status: "connecting" });
    this.connect();
    return null;
  }

  private connect(): void {
    const invite = this.invite!;
    let ws: WebSocket;
    try {
      ws = new this.WS(invite.wsUrl);
    } catch {
      return this.end("Couldn't open a connection to that game.");
    }
    this.ws = ws;
    let opened = false;

    ws.addEventListener("open", () => {
      opened = true;
      const identity = this.identity!;
      if (this.ticket) {
        this.send({ type: "join.resume", roomCode: invite.roomCode, playerId: this.ticket.playerId, token: this.ticket.token });
      } else if (this.gmToken) {
        this.send({ type: "join.gm", roomCode: invite.roomCode, gmToken: this.gmToken, ...identity });
      } else {
        this.send({ type: "join.request", roomCode: invite.roomCode, ...identity });
      }
    });
    ws.addEventListener("message", (e) => {
      if (this.ws !== ws) return;
      let msg: HostEnvelope;
      try {
        msg = JSON.parse(String(e.data));
      } catch {
        return;
      }
      this.onMessage(msg);
    });
    ws.addEventListener("close", (e) => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.onClose(e.code, opened);
    });
  }

  private onMessage(msg: HostEnvelope): void {
    if (msg.version !== PROTOCOL_VERSION) return;
    switch (msg.type) {
      case "join.pending":
        return this.setState({ status: "waiting" });
      case "join.accepted": {
        this.attempt = 0;
        this.ticket = {
          invite: this.inviteUrl,
          playerId: msg.playerId,
          token: msg.token,
          identity: this.identity!,
          isGm: msg.isGm,
        };
        this.options.onTicket?.(this.ticket);
        const me = msg.players.find((p) => p.playerId === msg.playerId)!;
        this.setState({ status: "connected", me, players: msg.players, roomCode: this.invite!.roomCode });
        for (const event of msg.history) this.deliver(event, true);
        return;
      }
      case "presence":
        if (this.state.status === "connected") {
          const me = msg.players.find((p) => p.playerId === (this.state as { me: PlayerInfo }).me.playerId);
          this.setState({ ...this.state, players: msg.players, me: me ?? this.state.me });
        }
        return;
      case "dice.result":
        return this.deliver(msg, false);
      case "dice.ack":
        this.seen.add(msg.eventId);
        return;
      case "join.denied":
        this.ticket = null;
        this.options.onTicket?.(null);
        return this.end(DENIED[msg.reason] ?? DENIED.denied!);
      case "session.ended":
        this.ticket = null;
        this.options.onTicket?.(null);
        return this.end("Game session ended by GM.");
      case "error":
        if (msg.code === "rate-limited") this.options.onNotice?.("Rolling too fast, so that roll wasn't shared. Wait a moment.");
        else if (msg.code !== "duplicate") this.options.onNotice?.(msg.message);
        return;
    }
  }

  private onClose(code: number, opened: boolean): void {
    if (this.state.status === "ended" || this.state.status === "idle") return;
    if (code === CLOSE.sessionEnded) return this.end("Game session ended by GM.");
    if (code === CLOSE.kicked) return this.end(DENIED.kicked!);
    if (code === CLOSE.replaced) return this.end("You joined this game from another tab or computer, so this one disconnected.");
    if (code === CLOSE.denied) return this.end(DENIED.denied!);

    // Only an approved player reconnects; anyone else starts over.
    if (!this.ticket) {
      return this.end(
        opened
          ? "The connection closed before the GM let you in. Try joining again."
          : "Couldn't reach that game. Check the invitation link, or ask your GM whether the session is running.",
      );
    }
    if (this.attempt >= this.backoff.maxAttempts) {
      return this.end("Lost the connection to the GM's game. If it's still running, rejoin with the invitation link.");
    }
    const delay = Math.min(this.backoff.baseMs * 2 ** this.attempt, this.backoff.maxMs);
    this.attempt++;
    this.setState({ status: "reconnecting", attempt: this.attempt, roomCode: this.invite!.roomCode });
    this.retryTimer = setTimeout(() => this.connect(), delay);
  }

  private deliver(event: DiceResultEvent, fromHistory: boolean): void {
    // Our own live rolls were marked seen by their ack, so after a reconnect
    // history only brings back rolls this tab hasn't shown (e.g. after a reload).
    if (this.seen.has(event.eventId) || !isConsistentResult(event)) return;
    this.seen.add(event.eventId);
    this.options.onResult(event, fromHistory);
  }

  private end(message: string): void {
    this.stopRetrying();
    const ws = this.ws;
    this.ws = null;
    ws?.close(1000);
    this.setState({ status: "ended", message });
  }

  private leaveQuietly(): void {
    this.stopRetrying();
    const ws = this.ws;
    this.ws = null;
    ws?.close(1000);
  }

  private stopRetrying(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  private send(msg: ClientMessage): boolean {
    if (this.ws?.readyState !== this.WS.OPEN) return false;
    this.ws.send(JSON.stringify({ ...msg, version: PROTOCOL_VERSION }));
    return true;
  }

  private setState(state: GameState): void {
    this.state = state;
    this.options.onState(state);
  }
}
