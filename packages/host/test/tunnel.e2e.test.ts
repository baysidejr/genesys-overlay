// Real Cloudflare Quick Tunnel test. Needs internet access and cloudflared:
//
//   $env:GENESYS_E2E_TUNNEL = "1"
//   $env:GENESYS_CLOUDFLARED = "C:\path\to\cloudflared.exe"   # if it isn't on PATH
//   pnpm --filter @genesys/host test -- tunnel.e2e
//
// Every client connects through the public wss:// address, exactly as
// players on other networks would.

import { describe, expect, it } from "vitest";
import { CLOSE, parseInvite } from "@genesys/shared";
import { Host } from "../src/host";
import type { JoinRequest } from "../src/server";
import { sampleRoll, TestClient } from "./helpers";

describe.skipIf(!process.env.GENESYS_E2E_TUNNEL)("real Cloudflare tunnel", () => {
  it("hosts a game that players reach from the internet", { timeout: 180_000 }, async () => {
    const host = new Host();
    const requests: JoinRequest[] = [];
    host.on("request", (r: JoinRequest) => requests.push(r));

    const status = await host.start();
    expect(status.error).toBeUndefined();
    expect(status.state).toBe("ready");
    expect(status.inviteUrl).toMatch(/^https:\/\/[a-z0-9-]+\.trycloudflare\.com\/join\?room=[A-Z2-9]{6}$/);
    console.log(`Tunnel up: ${new URL(status.inviteUrl!).origin}`);

    const invite = parseInvite(status.inviteUrl!)!;
    expect(invite.wsUrl.startsWith("wss://")).toBe(true);

    // The landing page is reachable from outside.
    const landing = await fetch(status.inviteUrl!);
    expect(landing.status).toBe(200);
    expect(await landing.text()).toContain("You're invited");

    const gm = await TestClient.connect(invite.wsUrl);
    gm.send({ type: "join.gm", roomCode: invite.roomCode, gmToken: status.gmToken, playerName: "GM", characterName: "Narrator" });
    expect((await gm.next("join.accepted", 15_000)).isGm).toBe(true);

    const join = async (playerName: string, characterName: string, characterClass: string) => {
      const c = await TestClient.connect(invite.wsUrl);
      c.send({ type: "join.request", roomCode: invite.roomCode, playerName, characterName, characterClass });
      await c.next("join.pending", 15_000);
      host.approve(requests.at(-1)!.requestId);
      await c.next("join.accepted", 15_000);
      return c;
    };
    const robin = await join("Robin", "Thorgar", "Warrior");
    const craig = await join("Craig", "Malakar", "Sorcerer");

    robin.send(sampleRoll("roll_e2e_0001"));
    await robin.next("dice.ack", 15_000);
    const atGm = await gm.next("dice.result", 15_000);
    const atCraig = await craig.next("dice.result", 15_000);
    expect(atGm.eventId).toBe(atCraig.eventId);
    expect(atGm).toMatchObject({ playerName: "Robin", characterName: "Thorgar", characterClass: "Warrior" });
    expect(atGm.results).toEqual({ success: 4, advantage: 0, triumph: 1, despair: 0 });

    // A late player sees the roll in the history.
    const jonathan = await join("Jonathan", "Valeria", "Rogue");
    const accepted = jonathan.of("join.accepted")[0]!;
    expect(accepted.history.map((e) => e.eventId)).toEqual([atGm.eventId]);

    await host.stop();
    for (const c of [gm, robin, craig, jonathan]) {
      expect(await c.closed(15_000)).toBe(CLOSE.sessionEnded);
      expect(c.of("session.ended")).toHaveLength(1);
    }
    // The public address no longer reaches anything of ours.
    const after = await fetch(`${invite.origin}/ping`).catch(() => null);
    expect(after === null || after.status !== 200 || (await after.text()) !== "genesys-host").toBe(true);
  });
});
