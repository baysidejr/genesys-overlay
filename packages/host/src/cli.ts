// Command-line host: start a game from a terminal, approve players there,
// press Ctrl+C to end it. The extension's Host game button does the same
// thing through native messaging.
//
//   node dist/cli.cjs                          host through a Cloudflare Quick Tunnel
//   node dist/cli.cjs --local                  host on 127.0.0.1 only (testing on one computer)
//   node dist/cli.cjs --local --approve-all    ...and let everyone in (testing only)

import { createInterface } from "node:readline";
import { Host } from "./host";
import type { JoinRequest } from "./server";

const local = process.argv.includes("--local");
// For testing on one computer only: never allowed with a public tunnel.
const approveAll = process.argv.includes("--approve-all");
if (approveAll && !local) {
  console.error("--approve-all only works with --local. A public game always needs your approval.");
  process.exit(1);
}
const host = new Host({ local });
const queue: JoinRequest[] = [];
const rl = createInterface({ input: process.stdin, output: process.stdout });
let asking = false;

const label = (r: Pick<JoinRequest, "playerName" | "characterName" | "characterClass">) =>
  `${r.playerName} as ${r.characterName}${r.characterClass ? ` (${r.characterClass})` : ""}`;

function askNext(): void {
  if (asking || !queue.length) return;
  const req = queue.shift()!;
  asking = true;
  rl.question(`\n${label(req)} wants to join. Let them in? [y/n] `, (answer) => {
    asking = false;
    const ok = /^y/i.test(answer.trim());
    if (!(ok ? host.approve(req.requestId) : host.deny(req.requestId))) {
      console.log("That request is no longer waiting.");
    } else {
      console.log(ok ? `Approved ${req.playerName}.` : `Turned away ${req.playerName}.`);
    }
    askNext();
  });
}

host.on("request", (r: JoinRequest) => {
  if (approveAll) {
    host.approve(r.requestId);
    console.log(`Let in ${label(r)} (--approve-all).`);
    return;
  }
  queue.push(r);
  askNext();
});
host.on("request-closed", (id: string) => {
  const i = queue.findIndex((r) => r.requestId === id);
  if (i >= 0) queue.splice(i, 1);
});
host.on("players", (players: { playerName: string; characterName: string; online: boolean }[]) => {
  const online = players.filter((p) => p.online).map((p) => `${p.playerName} / ${p.characterName}`);
  console.log(`Players online: ${online.length ? online.join(", ") : "none"}`);
});
host.on("state", (s: { state: string }) => {
  if (s.state === "starting-server") console.log("Starting the game server...");
  if (s.state === "starting-tunnel") console.log("Opening a Cloudflare tunnel (this can take up to a minute)...");
});
host.on("tunnel-down", (message: string) => {
  console.error(`\n${message}`);
  process.exit(1);
});

let stopping = false;
async function shutdown(): Promise<void> {
  if (stopping) return;
  stopping = true;
  console.log("\nEnding the session...");
  await host.stop();
  console.log("Session ended. Players were told the game is over.");
  process.exit(0);
}
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
rl.on("SIGINT", () => void shutdown());

async function main(): Promise<void> {
  const status = await host.start();
  if (status.state !== "ready") {
    console.error(`Couldn't start the session: ${status.error}`);
    process.exit(1);
  }
  console.log(`\nRoom ${status.roomCode} is open.`);
  console.log(`Send your players this invitation:\n\n  ${status.inviteUrl}\n`);
  console.log("Players join from the dice tray's Join game form. You approve each one here.");
  console.log("Press Ctrl+C to end the session.");
}

void main();
