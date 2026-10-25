# Genesys host companion

Lets a GM host a dice session from their own computer. There's no central server: the companion runs a small WebSocket server on `127.0.0.1` and shares it through a free [Cloudflare Quick Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/). Players only need the browser extension and the invitation link.

Quick Tunnels need no Cloudflare account. Cloudflare offers them for testing and casual use. The address changes every session, and Cloudflare doesn't guarantee them for long-running use.

## Install (GM, once)

Needs Windows and [Node.js 20+](https://nodejs.org).

```powershell
pnpm --filter @genesys/host build
powershell -ExecutionPolicy Bypass -File packages/host/scripts/install-host.ps1
```

The installer:

- copies the host to `%LOCALAPPDATA%\GenesysOverlay\host`
- downloads cloudflared 2026.10.0 from Cloudflare's GitHub releases, and keeps it only if its SHA-256 and Cloudflare code signature both match
- registers the Native Messaging host `com.genesys_overlay.host` for Chrome and Edge under `HKEY_CURRENT_USER` (no administrator rights)
- allows only the Genesys Overlay extension to start it: the developer build (ID `oompfooljghcchjdigpjicjdlncaaoki`, from the key in `manifest.json`) and the Chrome Web Store build (the ID in `$StoreExtensionId` at the top of `install-host.ps1`, filled in once the store assigns it)

To allow another ID as well, for example an Edge Add-ons install, pass it in:

```powershell
powershell -ExecutionPolicy Bypass -File packages/host/scripts/install-host.ps1 -ExtensionId <id>
```

To remove it:

```powershell
powershell -ExecutionPolicy Bypass -File packages/host/scripts/uninstall-host.ps1
```

## Host a game

**From the extension:** open the dice tray, open the game panel (the chip in the tray's header), fill in your name and character, and choose **Host a game**. Copy the invitation link and send it to your players. When someone asks to join, choose **Let in** or **Turn away**. **End session** disconnects everyone.

**From a terminal** (no extension needed for the GM, and handy for testing):

```bash
pnpm host
```

It prints the invitation link and asks you to approve each player. Press Ctrl+C to end the session. For testing on one computer without a tunnel:

```bash
pnpm host:local
```

To let everyone in automatically while testing locally, run `node packages/host/dist/cli.cjs --local --approve-all`. `--approve-all` refuses to run with a public tunnel.

## How it works

```
Player's extension ──wss──> https://<random>.trycloudflare.com ──> cloudflared ──> 127.0.0.1:<port> (host companion)
GM's extension ──Native Messaging──> host companion        (start, stop, approve, deny, remove players)
```

1. The GM's extension asks the companion to start (`host.start`). It listens on a free port on `127.0.0.1`, starts `cloudflared tunnel --url http://127.0.0.1:<port>`, and reads the `trycloudflare.com` address cloudflared prints.
2. It checks the address really reaches the server before reporting ready (see the DNS note below).
3. Players open the invitation `https://<tunnel>/join?room=<CODE>`. The page explains how to install the extension, and the extension saves the invitation automatically. Players can also paste it into **Join game**.
4. Each join waits for the GM's approval. Approved players get a session-scoped identity token for reconnecting.
5. A player rolls on their own screen. When the dice land, the extension sends the pool and the face each die showed. The host checks that the faces match the pool, recomputes every symbol and the cancelled totals with the shared dice engine, attaches the player's identity from the session, and broadcasts the result. Other players see a result entry: no 3D replay, no sound.
6. **End session**, closing the browser, or the tunnel dropping ends the session for everyone ("Game session ended by GM.").

Messages are versioned JSON (`packages/shared/src/multiplayer.ts`). Only player and character names, class, roll label, dice pool, die faces and totals travel. No rendering state, audio, or tabletop data.

### The DNS note

A new Quick Tunnel's name isn't in DNS for about ten seconds, and a lookup before then gets a "not found" that resolvers cache for minutes. So the host never looks its own address up while starting. It connects to Cloudflare's edge directly, naming the tunnel in TLS, until the server answers, then waits a few seconds before reporting ready. Starting usually takes 15 to 45 seconds.

## Security

- The server listens on `127.0.0.1` only. Through the tunnel it serves just `/ping`, `/join` (a static page) and `/ws`. No files, no proxying, no admin endpoints.
- Starting, stopping, approving and removing players happen only over Native Messaging (or the terminal), never over the tunnel. A connected client can't stop the host or change settings.
- Room codes identify a game. Each player's secret token is issued only after the GM approves them. The GM's own extension joins with a separate token that never leaves the computer except over the encrypted tunnel to the local server.
- Player identity is bound on the server. Names in roll messages are ignored.
- Strict schema validation, 8 KB message limit, rate limits (5 rolls burst, 1 per second; 20 messages burst, 10 per second), 10 players, 5 pending requests, unanswered requests time out after 2 minutes, heartbeats every 15 seconds, duplicate roll detection.
- Everything is in memory. The last 20 rolls are kept for players who join late and cleared when the session ends.
- Treat the invitation link as private: anyone with it can ask to join, though you still decide who gets in.

**Fair play:** the host checks that every result is consistent with its dice, but it can't prove a player's random roll was honest, because each player's browser rolls its own dice. This is deliberate for a casual game.

## Development

```bash
pnpm --filter @genesys/host test          # unit and local integration tests (builds first)
pnpm --filter @genesys/host test:tunnel   # real Cloudflare tunnel; see below
```

The real-tunnel test needs internet access and cloudflared:

```powershell
$env:GENESYS_E2E_TUNNEL = "1"
$env:GENESYS_CLOUDFLARED = "C:\path\to\cloudflared.exe"   # if it isn't on PATH or next to the host
pnpm --filter @genesys/host test:tunnel
```

cloudflared is found through `GENESYS_CLOUDFLARED`, next to the host files (where the installer puts it), or on the `PATH`.

**Multiple players on one computer:** load the extension in two Chrome profiles (or the GM's profile plus a guest window), host from one, and join from the other with the invitation link.

## Not done yet

- **One-click hosting through real Chrome hasn't been tried.** Everything around it has been tested: the installed launcher, framing and a full real session were driven exactly as Chrome would drive them. Loading the extension in Chrome and choosing **Host a game** is the remaining check.
- **The GM needs Node.js.** Bundling a standalone executable (for example with Node's single executable applications) would remove that step.
- **Windows only.** The installer and registry steps are Windows-only; the host itself is plain Node.
