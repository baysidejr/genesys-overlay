import { afterEach, describe, expect, it } from "vitest";
import { CLOSE, HISTORY_LIMIT } from "@genesys/shared";
import { GameServer, type JoinRequest } from "../src/server";
import { sampleRoll, settle, TestClient } from "./helpers";

let server: GameServer;
let port: number;
let requests: JoinRequest[];
const clients: TestClient[] = [];

async function startServer(options: ConstructorParameters<typeof GameServer>[0] = {}) {
  requests = [];
  server = new GameServer({ ...options, events: { onJoinRequest: (r) => requests.push(r) } });
  port = await server.start();
}

async function client(): Promise<TestClient> {
  const c = await TestClient.connect(port);
  clients.push(c);
  return c;
}

/** Connects a player and has the GM approve them. */
async function joinedPlayer(playerName: string, characterName = playerName + "'s hero") {
  const c = await client();
  c.send({ type: "join.request", roomCode: server.roomCode, playerName, characterName, characterClass: "Warrior" });
  await c.next("join.pending");
  server.approve(requests.at(-1)!.requestId);
  return { c, accepted: await c.next("join.accepted") };
}

afterEach(async () => {
  for (const c of clients.splice(0)) c.ws.terminate();
  await server?.stop();
});

describe("lifecycle", () => {
  it("listens only on 127.0.0.1 and answers the tunnel probe", async () => {
    await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/ping`);
    expect(await res.text()).toBe("genesys-host");
    expect((await fetch(`http://127.0.0.1:${port}/join?room=${server.roomCode}`)).status).toBe(200);
    // Nothing else is served: no files, no proxy.
    expect((await fetch(`http://127.0.0.1:${port}/../package.json`)).status).toBe(404);
    expect((await fetch(`http://127.0.0.1:${port}/admin`)).status).toBe(404);
  });

  it("stops, telling every client the session ended", async () => {
    await startServer();
    const { c } = await joinedPlayer("Robin");
    await server.stop();
    expect(await c.closed()).toBe(CLOSE.sessionEnded);
    expect(c.of("session.ended")).toHaveLength(1);
    await expect(TestClient.connect(port)).rejects.toThrow();
  });
});

describe("joining", () => {
  it("waits for the GM, then admits the player with an identity", async () => {
    await startServer();
    const { accepted } = await joinedPlayer("Robin", "Thorgar");
    expect(accepted.isGm).toBe(false);
    expect(accepted.token.length).toBeGreaterThan(20);
    expect(accepted.players).toEqual([
      expect.objectContaining({ playerName: "Robin", characterName: "Thorgar", characterClass: "Warrior", online: true }),
    ]);
  });

  it("turns away a player the GM denies", async () => {
    await startServer();
    const c = await client();
    c.send({ type: "join.request", roomCode: server.roomCode, playerName: "Stranger", characterName: "X" });
    await c.next("join.pending");
    server.deny(requests[0]!.requestId);
    expect((await c.next("join.denied")).reason).toBe("denied");
    expect(await c.closed()).toBe(CLOSE.denied);
    expect(server.listPlayers()).toEqual([]);
  });

  it("rejects the wrong room code without bothering the GM", async () => {
    await startServer();
    const c = await client();
    c.send({ type: "join.request", roomCode: "AAAAAA", playerName: "A", characterName: "B" });
    expect((await c.next("join.denied")).reason).toBe("bad-room");
    expect(requests).toEqual([]);
  });

  it("turns away requests nobody answers", async () => {
    await startServer({ pendingTimeoutMs: 50 });
    const c = await client();
    c.send({ type: "join.request", roomCode: server.roomCode, playerName: "A", characterName: "B" });
    expect((await c.next("join.denied")).reason).toBe("denied");
  });

  it("admits the GM's own extension with the GM token, and nobody without it", async () => {
    await startServer();
    const gm = await client();
    gm.send({ type: "join.gm", roomCode: server.roomCode, gmToken: server.gmToken, playerName: "Dee", characterName: "GM" });
    expect((await gm.next("join.accepted")).isGm).toBe(true);

    const faker = await client();
    faker.send({ type: "join.gm", roomCode: server.roomCode, gmToken: "a".repeat(32), playerName: "Dee", characterName: "GM" });
    expect((await faker.next("join.denied")).reason).toBe("bad-token");
  });

  it("is full at the player limit", async () => {
    await startServer({ maxPlayers: 1 });
    await joinedPlayer("One");
    const c = await client();
    c.send({ type: "join.request", roomCode: server.roomCode, playerName: "Two", characterName: "B" });
    expect((await c.next("join.denied")).reason).toBe("full");
  });

  it("resumes the same player after a dropped connection, without a duplicate entry", async () => {
    await startServer();
    const { c, accepted } = await joinedPlayer("Robin");
    c.ws.terminate();
    await settle();
    expect(server.listPlayers()[0]!.online).toBe(false);

    const again = await client();
    again.send({ type: "join.resume", roomCode: server.roomCode, playerId: accepted.playerId, token: accepted.token });
    const resumed = await again.next("join.accepted");
    expect(resumed.playerId).toBe(accepted.playerId);
    expect(server.listPlayers()).toHaveLength(1);
    expect(server.listPlayers()[0]!.online).toBe(true);
  });

  it("closes the older connection when a player connects twice", async () => {
    await startServer();
    const { c, accepted } = await joinedPlayer("Robin");
    const second = await client();
    second.send({ type: "join.resume", roomCode: server.roomCode, playerId: accepted.playerId, token: accepted.token });
    await second.next("join.accepted");
    expect(await c.closed()).toBe(CLOSE.replaced);
    expect(server.listPlayers()).toHaveLength(1);
  });

  it("refuses a resume with the wrong token, so players can't impersonate each other", async () => {
    await startServer();
    const { accepted } = await joinedPlayer("Robin");
    const c = await client();
    c.send({ type: "join.resume", roomCode: server.roomCode, playerId: accepted.playerId, token: "x".repeat(32) });
    expect((await c.next("join.denied")).reason).toBe("bad-token");
  });

  it("kicks a player and voids their identity", async () => {
    await startServer();
    const { c, accepted } = await joinedPlayer("Robin");
    expect(server.kick(accepted.playerId)).toBe(true);
    expect((await c.next("join.denied")).reason).toBe("kicked");
    expect(await c.closed()).toBe(CLOSE.kicked);

    const back = await client();
    back.send({ type: "join.resume", roomCode: server.roomCode, playerId: accepted.playerId, token: accepted.token });
    expect((await back.next("join.denied")).reason).toBe("bad-token");
  });
});

describe("dice results", () => {
  it("broadcasts a valid roll once to everyone else, with identity from the session", async () => {
    await startServer();
    const a = await joinedPlayer("Robin", "Thorgar");
    const b = await joinedPlayer("Craig", "Malakar");
    const c = await joinedPlayer("Jonathan", "Valeria");

    a.c.send({ ...sampleRoll("roll_00000001"), playerName: "Craig", characterName: "Malakar" });
    const ack = await a.c.next("dice.ack");
    const atB = await b.c.next("dice.result");
    await c.c.next("dice.result");
    await settle();

    expect(atB.eventId).toBe(ack.eventId);
    expect(atB).toMatchObject({ playerName: "Robin", characterName: "Thorgar", characterClass: "Warrior", label: "Athletics" });
    // ability 3 = SS, ability 6 = SA, difficulty 3 = T, proficiency 11 = Triumph
    expect(atB.symbols).toEqual({ success: 4, failure: 0, advantage: 1, threat: 1, triumph: 1, despair: 0 });
    expect(atB.results).toEqual({ success: 4, advantage: 0, triumph: 1, despair: 0 });
    expect(b.c.of("dice.result")).toHaveLength(1);
    expect(a.c.of("dice.result")).toHaveLength(0); // the roller already has it
  });

  it("rejects invalid, unjoined, duplicate and oversized rolls", async () => {
    await startServer();
    const a = await joinedPlayer("Robin");
    const b = await joinedPlayer("Craig");

    a.c.send({ ...sampleRoll("roll_00000002"), dicePool: { ability: 5 } });
    expect((await a.c.next("error")).code).toBe("bad-message");

    const stranger = await client();
    stranger.send(sampleRoll("roll_00000003"));
    expect((await stranger.next("error")).code).toBe("not-joined");

    a.c.send(sampleRoll("roll_00000004"));
    await a.c.next("dice.ack");
    a.c.send(sampleRoll("roll_00000004"));
    expect((await a.c.next("error")).code).toBe("duplicate");

    const big = await client();
    big.ws.send("x".repeat(64 * 1024));
    // The host closes with 1009 (too big); the client may see the drop as 1006 first.
    expect([1006, 1009]).toContain(await big.closed());

    await settle();
    expect(b.c.of("dice.result")).toHaveLength(1);
  });

  it("refuses client attempts to control the host", async () => {
    await startServer();
    const a = await joinedPlayer("Robin");
    for (const type of ["host.stop", "host.kickPlayer", "gm.approve", "presence", "dice.result"]) {
      a.c.send({ type, playerId: a.accepted.playerId });
      expect((await a.c.next("error")).code).toBe("bad-message");
    }
    expect(server.listPlayers()).toHaveLength(1);
  });

  it("rate-limits a player who rolls too fast", async () => {
    await startServer();
    const a = await joinedPlayer("Robin");
    for (let i = 0; i < 8; i++) a.c.send(sampleRoll(`roll_burst_${i}`));
    await settle(150);
    expect(a.c.of("dice.ack")).toHaveLength(5);
    expect(a.c.of("error").map((e) => e.code)).toContain("rate-limited");
  });

  it(`gives new players the last ${HISTORY_LIMIT} rolls and forgets them when the session ends`, async () => {
    await startServer();
    const players = [];
    for (const name of ["A", "B", "C", "D", "E"]) players.push(await joinedPlayer(name));
    let n = 0;
    for (const p of players) {
      for (let i = 0; i < 5; i++) p.c.send(sampleRoll(`roll_hist_${n++}`));
    }
    await settle(200);
    const late = await joinedPlayer("Late");
    expect(late.accepted.history).toHaveLength(HISTORY_LIMIT);
    expect(late.accepted.history.at(-1)!.playerName).toBe("E");

    await server.stop();
    await startServer();
    expect((await joinedPlayer("Next")).accepted.history).toEqual([]);
  });
});

describe("heartbeat", () => {
  it("drops a client that stops answering pings", async () => {
    await startServer({ heartbeatMs: 40 });
    const { c } = await joinedPlayer("Robin");
    // Silence pong replies, as a frozen tab would.
    (c.ws as unknown as { pong: () => void }).pong = () => {};
    c.ws.removeAllListeners("ping");
    (c.ws as unknown as { _receiver: { removeAllListeners(e: string): void } })._receiver.removeAllListeners("ping");
    await settle(200);
    expect(server.listPlayers()[0]!.online).toBe(false);
  });
});
