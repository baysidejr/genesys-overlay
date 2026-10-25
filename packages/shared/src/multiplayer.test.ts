import { describe, expect, it } from "vitest";
import {
  buildResultEvent,
  isConsistentResult,
  MAX_MESSAGE_BYTES,
  parseClientMessage,
  parseInvite,
  PROTOCOL_VERSION,
} from "./multiplayer";

const msg = (body: object) => JSON.stringify({ version: PROTOCOL_VERSION, ...body });

const roll = {
  type: "dice.roll",
  clientEventId: "evt_12345678",
  dicePool: { ability: 2, difficulty: 1 },
  dice: [
    { type: "ability", face: 3 },
    { type: "ability", face: 7 },
    { type: "difficulty", face: 7 },
  ],
};

describe("parseClientMessage", () => {
  it("accepts a valid join and trims names", () => {
    expect(
      parseClientMessage(
        msg({ type: "join.request", roomCode: "K7M9Q2", playerName: " Robin ", characterName: "Thorgar", characterClass: "Warrior" }),
      ),
    ).toEqual({ type: "join.request", roomCode: "K7M9Q2", playerName: "Robin", characterName: "Thorgar", characterClass: "Warrior" });
  });

  it("rejects joins with bad rooms, empty or long names", () => {
    const base = { type: "join.request", roomCode: "K7M9Q2", playerName: "A", characterName: "B" };
    expect(parseClientMessage(msg({ ...base, roomCode: "K7M9Q0" }))).toBeNull(); // 0 isn't in the alphabet
    expect(parseClientMessage(msg({ ...base, playerName: "  " }))).toBeNull();
    expect(parseClientMessage(msg({ ...base, characterName: "x".repeat(41) }))).toBeNull();
  });

  it("accepts a roll whose faces match the pool and drops extra fields", () => {
    const parsed = parseClientMessage(msg({ ...roll, results: { success: 99 }, playerName: "Someone else" }));
    expect(parsed).toMatchObject({ type: "dice.roll", clientEventId: "evt_12345678" });
    expect(parsed).not.toHaveProperty("results");
    expect(parsed).not.toHaveProperty("playerName");
  });

  it("rejects rolls whose dice don't match the pool or show impossible faces", () => {
    expect(parseClientMessage(msg({ ...roll, dicePool: { ability: 3, difficulty: 1 } }))).toBeNull();
    expect(parseClientMessage(msg({ ...roll, dice: [...roll.dice.slice(0, 2), { type: "difficulty", face: 8 }] }))).toBeNull();
    expect(parseClientMessage(msg({ ...roll, dice: [...roll.dice.slice(0, 2), { type: "force", face: 1 }] }))).toBeNull();
  });

  it("rejects other versions, unknown types, bad JSON and oversized input", () => {
    expect(parseClientMessage(JSON.stringify({ ...roll, version: 2 }))).toBeNull();
    expect(parseClientMessage(msg({ type: "host.stop" }))).toBeNull();
    expect(parseClientMessage("{not json")).toBeNull();
    expect(parseClientMessage(msg({ ...roll, label: "x".repeat(MAX_MESSAGE_BYTES) }))).toBeNull();
  });
});

describe("buildResultEvent", () => {
  it("computes the symbols and the cancelled totals from the faces", () => {
    const parsed = parseClientMessage(msg(roll));
    if (parsed?.type !== "dice.roll") throw new Error("expected a roll");
    const event = buildResultEvent(
      parsed,
      { playerId: "p_12345678", playerName: "Robin", characterName: "Thorgar", characterClass: "Warrior" },
      "e1",
      new Date("2026-10-24T21:00:00Z"),
    );
    // ability 3 = SS, ability 7 = AA, difficulty 7 = F+T
    expect(event.symbols).toEqual({ success: 2, failure: 1, advantage: 2, threat: 1, triumph: 0, despair: 0 });
    expect(event.results).toEqual({ success: 1, advantage: 1, triumph: 0, despair: 0 });
    expect(event.dicePool).toEqual({ boost: 0, setback: 0, ability: 2, difficulty: 1, proficiency: 0, challenge: 0 });
    expect(isConsistentResult(event)).toBe(true);
    expect(isConsistentResult({ ...event, results: { ...event.results, success: 3 } })).toBe(false);
  });
});

describe("parseInvite", () => {
  it("reads the tunnel host and room code", () => {
    expect(parseInvite("https://brave-otter-lamp.trycloudflare.com/join?room=k7m9q2")).toEqual({
      wsUrl: "wss://brave-otter-lamp.trycloudflare.com/ws",
      roomCode: "K7M9Q2",
      origin: "https://brave-otter-lamp.trycloudflare.com",
    });
  });

  it("allows plain http only on this computer", () => {
    expect(parseInvite("http://127.0.0.1:5000/join?room=K7M9Q2")?.wsUrl).toBe("ws://127.0.0.1:5000/ws");
    expect(parseInvite("http://example.com/join?room=K7M9Q2")).toBeNull();
    expect(parseInvite("https://example.com/join")).toBeNull();
    expect(parseInvite("not a link")).toBeNull();
  });
});
