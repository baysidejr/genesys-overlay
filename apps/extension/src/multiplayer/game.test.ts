// The extension side against a real host server on 127.0.0.1: the same
// GameClient and Game the overlay uses, with the 3D view replaced by a spy.

import { afterEach, describe, expect, it, vi } from "vitest";
import { GameServer, type JoinRequest } from "@genesys/host/server";
import type { RolledDie } from "@genesys/shared";
import { GameClient, type GameState, type Identity } from "./client";
import { Game, type FeedEntry, type GameView } from "./game";

let server: GameServer;
const players: Player[] = [];

afterEach(async () => {
  for (const p of players.splice(0)) p.client.leave();
  await server?.stop();
});

class Player {
  readonly states: GameState[] = [];
  readonly feed: FeedEntry[] = [];
  readonly cards: FeedEntry[] = [];
  readonly notices: string[] = [];
  readonly animate = vi.fn(async (_roll: { id: string; dice: RolledDie[] }) => {});
  readonly client: GameClient;
  readonly game: Game;

  constructor(readonly identity: Identity, fixedDice?: RolledDie[]) {
    const view: GameView = {
      animate: this.animate,
      addToFeed: (e) => this.feed.push(e),
      showResult: (e) => this.cards.push(e),
      notice: (m) => this.notices.push(m),
    };
    this.client = new GameClient({
      onState: (s) => this.states.push(s),
      onResult: (event, fromHistory) => this.game.showRemote(event, fromHistory),
      onNotice: (m) => this.notices.push(m),
      backoff: { baseMs: 20, maxMs: 50, maxAttempts: 3 },
    });
    this.game = new Game(view, this.client, () => identity, fixedDice ? () => fixedDice : undefined);
    players.push(this);
  }

  get status() {
    return this.client.current.status;
  }
}

const until = async (check: () => boolean, ms = 2000) => {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error("Timed out");
    await new Promise((r) => setTimeout(r, 10));
  }
};

async function host() {
  const requests: JoinRequest[] = [];
  server = new GameServer({ events: { onJoinRequest: (r) => requests.push(r) } });
  const port = await server.start();
  return { invite: `http://127.0.0.1:${port}/join?room=${server.roomCode}`, requests };
}

async function joined(invite: string, requests: JoinRequest[], identity: Identity, dice?: RolledDie[]) {
  const p = new Player(identity, dice);
  expect(p.client.join(invite, identity)).toBeNull();
  await until(() => p.status === "waiting");
  server.approve(requests.at(-1)!.requestId);
  await until(() => p.status === "connected");
  return p;
}

const thorgar = { playerName: "Robin", characterName: "Thorgar", characterClass: "Warrior" };
const malakar = { playerName: "Craig", characterName: "Malakar", characterClass: "Sorcerer" };
// ability 3 = two successes, proficiency 11 = triumph
const knownDice: RolledDie[] = [
  { type: "ability", face: 3 },
  { type: "proficiency", face: 11 },
];

describe("single player", () => {
  it("still rolls and shows results with no game and no network", async () => {
    const solo = new Player(thorgar);
    const entry = await solo.game.rollLocal({ ability: 2, difficulty: 1 }, { label: "Athletics" });
    expect(solo.animate).toHaveBeenCalledTimes(1);
    expect(solo.feed).toEqual([entry]);
    expect(solo.cards).toEqual([entry]);
    expect(entry).toMatchObject({ self: true, characterName: "Thorgar", label: "Athletics" });
    expect(solo.notices).toEqual([]);
  });
});

describe("multiplayer", () => {
  it("shares a finished roll, and others see it without any animation", async () => {
    const { invite, requests } = await host();
    const robin = await joined(invite, requests, thorgar, knownDice);
    const craig = await joined(invite, requests, malakar);

    await robin.game.rollLocal({ ability: 1, proficiency: 1 }, { label: "Melee" });
    await until(() => craig.feed.length === 1);

    expect(robin.animate).toHaveBeenCalledTimes(1);
    expect(craig.animate).not.toHaveBeenCalled();
    expect(craig.feed[0]).toMatchObject({
      self: false,
      playerName: "Robin",
      characterName: "Thorgar",
      characterClass: "Warrior",
      label: "Melee",
      results: { success: 3, advantage: 0, triumph: 1, despair: 0 },
      symbols: { success: 3, failure: 0, advantage: 0, threat: 0, triumph: 1, despair: 0 },
    });
    expect(craig.cards).toHaveLength(1);
  });

  it("keeps a hidden GM roll off the table", async () => {
    const { invite, requests } = await host();
    const gm = new Player({ playerName: "Dee", characterName: "GM" });
    gm.client.joinAsGm(invite, server.gmToken, gm.identity);
    await until(() => gm.status === "connected");
    const craig = await joined(invite, requests, malakar);

    await gm.game.rollLocal({ challenge: 1 }, { hidden: true });
    await new Promise((r) => setTimeout(r, 100));
    expect(gm.feed[0]!.hidden).toBe(true);
    expect(craig.feed).toEqual([]);
  });

  it("fills a late player's feed from history without popping cards", async () => {
    const { invite, requests } = await host();
    const robin = await joined(invite, requests, thorgar);
    await robin.game.rollLocal({ ability: 1 });
    await robin.game.rollLocal({ boost: 1 });
    await new Promise((r) => setTimeout(r, 50));

    const craig = await joined(invite, requests, malakar);
    await until(() => craig.feed.length === 2);
    expect(craig.cards).toEqual([]);
    expect(craig.animate).not.toHaveBeenCalled();
  });

  it("reconnects as the same player and doesn't repeat rolls it already showed", async () => {
    const { invite, requests } = await host();
    const robin = await joined(invite, requests, thorgar);
    const craig = await joined(invite, requests, malakar);
    await robin.game.rollLocal({ ability: 1 });
    await until(() => craig.feed.length === 1);

    // Drop Craig's connection the way a network blip would.
    (craig.client as unknown as { ws: WebSocket }).ws.close(4999);
    await until(() => craig.states.some((s) => s.status === "reconnecting"));
    await until(() => craig.status === "connected");

    expect(server.listPlayers()).toHaveLength(2);
    expect(craig.feed).toHaveLength(1);
  });

  it("tells players when the GM ends the session, and stops trying", async () => {
    const { invite, requests } = await host();
    const robin = await joined(invite, requests, thorgar);
    await server.stop();
    await until(() => robin.status === "ended");
    expect(robin.client.current).toEqual({ status: "ended", message: "Game session ended by GM." });
  });

  it("gives up with a clear message when the GM's game can't be reached", async () => {
    const { invite, requests } = await host();
    const robin = await joined(invite, requests, thorgar);
    // The tunnel vanishes without the host saying goodbye.
    server.stop();
    (robin.client as unknown as { ws: WebSocket }).ws.close(4999);
    await until(() => robin.status === "ended", 3000);
    expect((robin.client.current as { message: string }).message).toMatch(/session|connection/i);
  });

  it("explains a bad invitation instead of connecting", () => {
    const p = new Player(thorgar);
    expect(p.client.join("https://example.com/no-room", thorgar)).toMatch(/invitation link/);
    expect(p.status).toBe("idle");
  });
});
