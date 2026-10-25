// Puts the dice stage, tray and result card on the page inside a Shadow DOM,
// and connects them to a GM-hosted game when the player joins one.
// Everything works without a game: rolls are then practice, seen only here.

import type { DicePool } from "@genesys/shared";
import { DiceRoller } from "./dice/roller";
import { DiceStage } from "./dice/stage";
import { GameClient, type GameState, type Identity } from "./multiplayer/client";
import { Game, type FeedEntry } from "./multiplayer/game";
import { HostBridge, type HostStatus, type JoinRequest } from "./multiplayer/host-bridge";
import overlayCss from "./overlay.css?inline";
import keyforgeCss from "./sheet/keyforge.css?inline";
import sheetPartsCss from "./sheet/sheet-parts.css?inline";
import terrinothCss from "./sheet/terrinoth.css?inline";
import themesCss from "./sheet/themes.css?inline";
import { SheetPanel } from "./sheet/sheet-panel";
import type { SheetTheme } from "./sheet/theme-menu";
import { h } from "./ui/dom";
import { loadFonts } from "./ui/fonts";
import { ResultCard } from "./ui/result";
import { DiceSounds } from "./ui/sounds";
import {
  loadIdentity,
  loadLibrary,
  loadPendingInvite,
  loadPosition,
  loadSheetOpen,
  loadSheetTheme,
  loadSoundOn,
  loadTicket,
  saveIdentity,
  saveLibrary,
  savePendingInvite,
  savePosition,
  saveSheetOpen,
  saveSheetTheme,
  saveSoundOn,
  saveTicket,
} from "./ui/storage";
import { Tray } from "./ui/tray";

const HOST_ID = "genesys-overlay-host";

export interface Overlay {
  stage: DiceStage;
  roller: DiceRoller;
  tray: Tray;
  sheet: SheetPanel;
  client: GameClient;
  /** Rolls in this browser, sharing it if in a game. */
  roll(pool: DicePool, options?: { label?: string; hidden?: boolean }): Promise<FeedEntry>;
}

export function mountOverlay(parent: HTMLElement): Overlay {
  document.getElementById(HOST_ID)?.remove();
  void loadFonts();

  const host = h("div", { id: HOST_ID });
  parent.appendChild(host);
  const shadow = host.attachShadow({ mode: "open" });
  const diceLayer = h("div", { class: "dice-layer" });
  shadow.append(h("style", {}, overlayCss + sheetPartsCss + themesCss + terrinothCss + keyforgeCss), diceLayer);

  const stage = new DiceStage(diceLayer);
  // Room for the result card: 20px margin plus its height, matching overlay.css.
  stage.setTopInset(130);
  const roller = new DiceRoller(stage);
  const results = new ResultCard();
  const sounds = new DiceSounds();

  let identity: Identity = { playerName: "", characterName: "" };
  let gameState: GameState = { status: "idle" };
  let pendingInvite: string | null = null;
  const bridge = HostBridge.available ? new HostBridge() : null;
  let hosting: HostStatus | null = bridge ? { state: "idle", players: [], requests: [] } : null;

  const update = () => tray.setView({ game: gameState, hosting, identity, pendingInvite });

  const client = new GameClient({
    onState: (state) => {
      const joinedNew = state.status === "connected" && gameState.status !== "connected" && gameState.status !== "reconnecting";
      gameState = state;
      if (joinedNew) {
        tray.clearLog();
        // The invitation has been used.
        pendingInvite = null;
        void savePendingInvite(null);
      }
      update();
    },
    onResult: (event, fromHistory) => game.showRemote(event, fromHistory),
    onNotice: (message) => tray.showNotice(message),
    onTicket: (ticket) => void saveTicket(ticket),
  });

  const game = new Game(
    {
      animate: (roll) => {
        void sounds.roll();
        return roller.show(roll);
      },
      addToFeed: (entry) => tray.addLog(entry),
      showResult: (entry) => results.show(entry),
      notice: (message) => tray.showNotice(message),
    },
    client,
    () => identity,
  );

  // ---------- Hosting (GM) ----------

  /** The GM's own extension joins the game it hosts, so the GM rolls and sees the feed too. */
  function joinOwnGame(status: HostStatus): void {
    if (status.state !== "ready" || !status.inviteUrl || !status.gmToken) return;
    if (client.current.status === "connected" || client.current.status === "connecting") return;
    client.joinAsGm(status.inviteUrl, status.gmToken, identity);
  }

  bridge?.on((event, data) => {
    if (!hosting) return;
    switch (event) {
      case "host.state": {
        const next = data as HostStatus;
        hosting = { ...next, gmToken: undefined };
        if (next.state === "ready") joinOwnGame(next);
        break;
      }
      case "host.request":
        hosting = { ...hosting, requests: [...hosting.requests.filter((r) => r.requestId !== (data as JoinRequest).requestId), data as JoinRequest] };
        tray.openSession();
        break;
      case "host.requestClosed":
        hosting = { ...hosting, requests: hosting.requests.filter((r) => r.requestId !== data) };
        break;
      case "host.players":
        hosting = { ...hosting, players: data as HostStatus["players"] };
        break;
      case "host.tunnelDown":
        tray.showNotice(String(data));
        break;
      case "host.disconnected":
        hosting = { state: "idle", players: [], requests: [], error: data === "not-installed" ? undefined : String(data) };
        break;
    }
    update();
  });

  // The tray and roll results wear the sheet's theme. The tray joins once it exists.
  const themed: HTMLElement[] = [results.el];
  const wearTheme = (theme: SheetTheme) => themed.forEach((el) => (el.dataset.theme = theme));

  // Built before the tray, which tells it how much room to leave.
  // It only reaches for the tray when a skill is clicked.
  const sheet = new SheetPanel({
    roll: (pool, label) => tray.loadPool(pool, label),
    persist: (library) => void saveLibrary(library),
    // Your sheet is who you play as: it fills in the join form.
    activeChanged: (character) => {
      if (!character) return;
      const next: Identity = {
        playerName: character.player || identity.playerName,
        characterName: character.name,
        characterClass: character.career || undefined,
      };
      if (next.playerName === identity.playerName && next.characterName === identity.characterName && next.characterClass === identity.characterClass) return;
      identity = next;
      void saveIdentity(identity);
      update();
    },
    onVisibilityChange: (open) => void saveSheetOpen(open),
    onThemeChange: (theme) => void saveSheetTheme(theme),
    themeApplied: wearTheme,
  });
  void loadSheetTheme().then((theme) => sheet.setTheme(theme));

  const tray: Tray = new Tray({
    roll: (pool, options) => void game.rollLocal(pool, options),
    session: {
      join: (invite, who) => {
        identity = who;
        void saveIdentity(who);
        return client.join(invite, who);
      },
      leave: () => {
        client.leave();
        tray.clearLog();
      },
      hostStart: async (who) => {
        if (!bridge) throw new Error("Hosting only works in the installed extension.");
        identity = who;
        void saveIdentity(who);
        const status = await bridge.request<HostStatus>({ type: "host.start" });
        if (status.state !== "ready") throw new Error(status.error ?? "The session didn't start.");
        hosting = { ...status, gmToken: undefined };
        joinOwnGame(status);
        update();
      },
      hostStop: async () => {
        await bridge?.request({ type: "host.stop" });
      },
      approve: (requestId) => void bridge?.request({ type: "host.approve", requestId }),
      deny: (requestId) => void bridge?.request({ type: "host.deny", requestId }),
      kick: (playerId) => void bridge?.request({ type: "host.kickPlayer", playerId }),
      identityChanged: (who) => {
        identity = who;
        void saveIdentity(who);
      },
    },
    // Dice keep clear of the tray, and so does the sheet. The sheet itself
    // sits under the dice, so rolls tumble across it.
    onCoverChange: (cover) => {
      stage.setSideInsets(cover.left, cover.right);
      sheet.makeRoomFor(cover);
    },
    onMove: (pos) => void savePosition("tray", pos),
    toggleSheet: () => sheet.toggle(),
    onSoundChange: (on) => {
      sounds.enabled = on;
      void saveSoundOn(on);
    },
  });

  themed.push(tray.el);
  wearTheme(sheet.theme);
  shadow.append(results.el, sheet.el, tray.el);
  void loadSoundOn().then((on) => {
    sounds.enabled = on;
    tray.setSoundOn(on);
  });
  void loadPosition("tray").then((pos) => pos && tray.setPosition(pos));
  void loadLibrary().then((library) => sheet.setLibrary(library));
  void loadSheetOpen().then((open) => open && sheet.show(true));

  // Restore: saved details, a waiting invitation, a game to rejoin, a session being hosted.
  void (async () => {
    identity = await loadIdentity();
    pendingInvite = await loadPendingInvite();
    update();
    const status = bridge ? await bridge.request<HostStatus | null>({ type: "host.status" }).catch(() => null) : null;
    if (status && status.state !== "idle") {
      hosting = { ...status, gmToken: undefined };
      update();
      joinOwnGame(status);
      return;
    }
    const ticket = await loadTicket();
    if (ticket && !ticket.isGm) {
      identity = ticket.identity;
      client.resume(ticket);
    } else if (pendingInvite) {
      tray.openSession();
    }
  })();

  return { stage, roller, tray, sheet, client, roll: (pool, options) => game.rollLocal(pool, options) };
}
