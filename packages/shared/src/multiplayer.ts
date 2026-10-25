// GM-hosted multiplayer protocol, version 1. JSON over a WebSocket between
// each player's extension and the host companion running on the GM's
// computer (reached through a Cloudflare Quick Tunnel).
//
// Only completed results travel: who rolled, the pool, and the face each die
// showed. The host recomputes the totals from the faces with the shared dice
// engine, so a client can't claim a total its dice don't show. The host can't
// prove a player's local random roll was honest; that is out of scope.

import {
  DIE_TYPES,
  diceMatchPool,
  isValidPool,
  summarize,
  tally,
  type DicePool,
  type RollResult,
  type RolledDie,
  type SymbolTally,
} from "./dice";

export const PROTOCOL_VERSION = 1;

/** Largest message either side accepts, in bytes. A 120-die roll is well under this. */
export const MAX_MESSAGE_BYTES = 8 * 1024;
export const MAX_PLAYERS = 10;
export const HISTORY_LIMIT = 20;

export const LIMITS = {
  name: 40,
  className: 30,
  label: 80,
  roomCode: 6,
  token: 64,
  eventId: 64,
} as const;

/** Room codes avoid 0/O and 1/I so they read aloud cleanly. */
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export interface PlayerInfo {
  playerId: string;
  playerName: string;
  characterName: string;
  characterClass?: string;
  isGm: boolean;
  online: boolean;
}

/** A roll as the host broadcasts it. Identity comes from the host, never the sender. */
export interface DiceResultEvent {
  version: typeof PROTOCOL_VERSION;
  type: "dice.result";
  /** Assigned by the host. */
  eventId: string;
  /** ISO 8601, from the host's clock. */
  timestamp: string;
  playerId: string;
  playerName: string;
  characterName: string;
  characterClass?: string;
  label?: string;
  dicePool: DicePool;
  dice: RolledDie[];
  /** Every symbol showing, before cancellation. */
  symbols: SymbolTally;
  /** After cancellation. */
  results: RollResult;
}

// ---------- Client to host ----------

export type ClientMessage =
  | {
      type: "join.request";
      roomCode: string;
      playerName: string;
      characterName: string;
      characterClass?: string;
    }
  | { type: "join.resume"; roomCode: string; playerId: string; token: string }
  | {
      /** The GM's own extension, holding the token the host gave it locally. */
      type: "join.gm";
      roomCode: string;
      gmToken: string;
      playerName: string;
      characterName: string;
      characterClass?: string;
    }
  | { type: "dice.roll"; clientEventId: string; label?: string; dicePool: DicePool; dice: RolledDie[] };

export type ClientEnvelope = ClientMessage & { version: typeof PROTOCOL_VERSION };

// ---------- Host to client ----------

export type HostMessage =
  | { type: "join.pending" }
  | {
      type: "join.accepted";
      playerId: string;
      /** Proves this player's identity when reconnecting. Session-scoped. */
      token: string;
      isGm: boolean;
      players: PlayerInfo[];
      history: DiceResultEvent[];
    }
  | { type: "join.denied"; reason: "denied" | "full" | "bad-room" | "bad-token" | "kicked" }
  | { type: "presence"; players: PlayerInfo[] }
  | DiceResultEvent
  | { type: "dice.ack"; clientEventId: string; eventId: string }
  | { type: "session.ended"; reason: "stopped" }
  | { type: "error"; code: ErrorCode; message: string };

export type HostEnvelope = HostMessage & { version: typeof PROTOCOL_VERSION };

export type ErrorCode = "bad-message" | "too-large" | "rate-limited" | "not-joined" | "duplicate" | "version";

/** WebSocket close codes the host uses, so clients know whether to reconnect. */
export const CLOSE = {
  sessionEnded: 4000,
  denied: 4001,
  kicked: 4002,
  protocol: 4003,
  replaced: 4004,
} as const;

// ---------- Validation ----------

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Trimmed, length-limited printable text, or null if missing/invalid. */
export function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  // Drop control characters so names can't break layouts or logs.
  const text = value.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return text.length > 0 && text.length <= max ? text : null;
}

function optionalText(value: unknown, max: number): string | undefined | null {
  if (value === undefined || value === "") return undefined;
  return cleanText(value, max);
}

const isRoomCode = (v: unknown): v is string =>
  typeof v === "string" && v.length === LIMITS.roomCode && [...v].every((c) => ROOM_CODE_ALPHABET.includes(c));

const isToken = (v: unknown, max: number): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{8,}$/.test(v) && v.length <= max;

/**
 * Parses and checks a message from a client. Returns null for anything that
 * isn't exactly a valid v1 client message; extra fields are dropped.
 */
export function parseClientMessage(raw: string): ClientMessage | null {
  if (raw.length > MAX_MESSAGE_BYTES) return null;
  let msg: unknown;
  try {
    msg = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(msg) || msg.version !== PROTOCOL_VERSION) return null;

  switch (msg.type) {
    case "join.request":
    case "join.gm": {
      if (!isRoomCode(msg.roomCode)) return null;
      const playerName = cleanText(msg.playerName, LIMITS.name);
      const characterName = cleanText(msg.characterName, LIMITS.name);
      const characterClass = optionalText(msg.characterClass, LIMITS.className);
      if (!playerName || !characterName || characterClass === null) return null;
      if (msg.type === "join.request") {
        return { type: "join.request", roomCode: msg.roomCode, playerName, characterName, characterClass };
      }
      if (!isToken(msg.gmToken, LIMITS.token)) return null;
      return { type: "join.gm", roomCode: msg.roomCode, gmToken: msg.gmToken, playerName, characterName, characterClass };
    }
    case "join.resume":
      if (!isRoomCode(msg.roomCode) || !isToken(msg.playerId, LIMITS.token) || !isToken(msg.token, LIMITS.token)) {
        return null;
      }
      return { type: "join.resume", roomCode: msg.roomCode, playerId: msg.playerId, token: msg.token };
    case "dice.roll": {
      if (!isToken(msg.clientEventId, LIMITS.eventId)) return null;
      const label = optionalText(msg.label, LIMITS.label);
      if (label === null || !isValidPool(msg.dicePool)) return null;
      const dicePool = normalizePool(msg.dicePool);
      if (!diceMatchPool(msg.dice, dicePool)) return null;
      const dice = msg.dice.map(({ type, face }) => ({ type, face }));
      return { type: "dice.roll", clientEventId: msg.clientEventId, label, dicePool, dice };
    }
    default:
      return null;
  }
}

/** Fills in zeros so every pool lists all six dice in a fixed order. */
export function normalizePool(pool: DicePool): Required<DicePool> {
  return Object.fromEntries(DIE_TYPES.map((t) => [t, pool[t] ?? 0])) as Required<DicePool>;
}

/** Builds the broadcast event for a validated roll, computing totals from the faces. */
export function buildResultEvent(
  roll: Extract<ClientMessage, { type: "dice.roll" }>,
  player: Pick<PlayerInfo, "playerId" | "playerName" | "characterName" | "characterClass">,
  eventId: string,
  now: Date,
): DiceResultEvent {
  return {
    version: PROTOCOL_VERSION,
    type: "dice.result",
    eventId,
    timestamp: now.toISOString(),
    playerId: player.playerId,
    playerName: player.playerName,
    characterName: player.characterName,
    ...(player.characterClass ? { characterClass: player.characterClass } : {}),
    ...(roll.label ? { label: roll.label } : {}),
    dicePool: normalizePool(roll.dicePool),
    dice: roll.dice,
    symbols: tally(roll.dice),
    results: summarize(roll.dice),
  };
}

/**
 * Checks a dice.result from the host before showing it: the faces must match
 * the pool and the totals must be what those faces add up to.
 */
export function isConsistentResult(event: unknown): event is DiceResultEvent {
  if (!isRecord(event) || event.type !== "dice.result" || event.version !== PROTOCOL_VERSION) return false;
  if (typeof event.eventId !== "string" || typeof event.playerName !== "string") return false;
  if (typeof event.characterName !== "string" || typeof event.timestamp !== "string") return false;
  if (!isValidPool(event.dicePool) || !diceMatchPool(event.dice, event.dicePool)) return false;
  const expected = summarize(event.dice);
  const results = event.results as RollResult | undefined;
  return (
    !!results &&
    results.success === expected.success &&
    results.advantage === expected.advantage &&
    results.triumph === expected.triumph &&
    results.despair === expected.despair
  );
}

/** Splits an invitation link into the tunnel's WebSocket address and the room code. */
export function parseInvite(input: string): { wsUrl: string; roomCode: string; origin: string } | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopback(url.hostname))) return null;
  const roomCode = url.searchParams.get("room")?.toUpperCase() ?? "";
  if (!isRoomCode(roomCode)) return null;
  const ws = url.protocol === "https:" ? "wss:" : "ws:";
  return { wsUrl: `${ws}//${url.host}/ws`, roomCode, origin: url.origin };
}

const isLoopback = (host: string) => host === "127.0.0.1" || host === "localhost" || host === "[::1]";
