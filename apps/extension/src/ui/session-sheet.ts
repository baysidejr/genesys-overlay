// The tray's multiplayer sheet: your character, joining a game with the GM's
// invitation, and (for the GM) hosting one. Inputs are created once and kept,
// so live updates (players arriving, connection changes) never wipe what
// someone is typing.

import type { PlayerInfo } from "@genesys/shared";
import type { GameState, Identity } from "../multiplayer/client";
import { HOST_DOWNLOAD_URL, HostNotInstalledError, type HostStatus } from "../multiplayer/host-bridge";
import { h } from "./dom";
import { characterLabel } from "./result";

export interface SessionView {
  game: GameState;
  /** Null where hosting isn't possible (outside the extension). */
  hosting: HostStatus | null;
  identity: Identity;
  pendingInvite: string | null;
}

export interface SessionActions {
  join(invite: string, identity: Identity): string | null;
  leave(): void;
  hostStart(identity: Identity): Promise<void>;
  hostStop(): Promise<void>;
  approve(requestId: string): void;
  deny(requestId: string): void;
  kick(playerId: string): void;
  identityChanged(identity: Identity): void;
}

const CLASSES = ["Warrior", "Rogue", "Sorcerer", "Barbarian", "Amazon", "Necromancer", "Paladin", "Druid", "Assassin", "Sorceress", "Monk"];

const HOST_STEPS: Record<string, string> = {
  "starting-server": "Starting the game server…",
  "starting-tunnel": "Opening a Cloudflare tunnel. This can take up to a minute.",
  stopping: "Ending the session…",
};

export class SessionSheet {
  readonly el = h("div", { class: "room-sheet", hidden: true });
  private view: SessionView | null = null;

  private readonly playerName: HTMLInputElement;
  private readonly characterName: HTMLInputElement;
  private readonly characterClass: HTMLInputElement;
  private readonly identityFields: HTMLElement;
  private readonly invite: HTMLInputElement;
  private readonly error = h("div", { class: "notice", role: "alert", hidden: true });
  private readonly body = h("div", { class: "sheet-body" });
  private busy = false;
  /** The identity last written into the fields, to tell the player's own edits apart. */
  private shownIdentity: Identity = { playerName: "", characterName: "" };
  /** Which panel is showing, so the start forms aren't rebuilt needlessly. */
  private shown = "";

  constructor(private readonly actions: SessionActions) {
    const onIdentity = () => this.actions.identityChanged(this.identity());
    this.playerName = h("input", { class: "field", type: "text", maxLength: 40, autocomplete: "nickname", oninput: onIdentity });
    this.characterName = h("input", { class: "field", type: "text", maxLength: 40, oninput: onIdentity });
    this.characterClass = h("input", { class: "field", type: "text", maxLength: 30, list: "genesys-classes", oninput: onIdentity });
    this.identityFields = h(
      "div",
      { class: "field-grid" },
      field("Player name", this.playerName),
      field("Character", this.characterName),
      field("Class", this.characterClass, "Optional"),
      h("datalist", { id: "genesys-classes" }, ...CLASSES.map((c) => h("option", { value: c }))),
    );
    this.invite = h("input", {
      class: "field",
      type: "url",
      placeholder: "https://…trycloudflare.com/join?room=…",
      spellcheck: false,
      onkeydown: (e: KeyboardEvent) => {
        if (e.key === "Enter") this.join();
      },
    });
    this.el.append(this.error, this.body);
  }

  update(view: SessionView): void {
    // Follow the saved details and the character sheet, but never overwrite
    // a field the player has typed something different into.
    const follow = (input: HTMLInputElement, before: string, after: string) => {
      if (input.value === before && document.activeElement !== input) input.value = after;
    };
    follow(this.playerName, this.shownIdentity.playerName, view.identity.playerName);
    follow(this.characterName, this.shownIdentity.characterName, view.identity.characterName);
    follow(this.characterClass, this.shownIdentity.characterClass ?? "", view.identity.characterClass ?? "");
    this.shownIdentity = { ...view.identity };
    this.view = view;
    if (view.pendingInvite && !this.invite.value) this.invite.value = view.pendingInvite;
    if (view.game.status === "ended") this.showError(view.game.message);
    if (!this.el.hidden) this.render();
  }

  open(): void {
    this.el.hidden = false;
    this.shown = "";
    this.render();
  }

  close(): void {
    this.el.hidden = true;
  }

  private identity(): Identity {
    return {
      playerName: this.playerName.value.trim(),
      characterName: this.characterName.value.trim(),
      characterClass: this.characterClass.value.trim() || undefined,
    };
  }

  private render(): void {
    const v = this.view;
    if (!v) return;
    const hosting = v.hosting && v.hosting.state !== "idle" ? v.hosting : null;
    const game = v.game;

    // The start forms hold what the player is typing; only rebuild them when
    // what they show actually changes, so typing never loses focus.
    const kind = hosting ? "host" : ["connected", "reconnecting", "connecting", "waiting"].includes(game.status) ? game.status : `start:${Boolean(v.hosting)}`;
    if (kind.startsWith("start") && kind === this.shown) return;
    this.shown = kind;

    if (hosting) this.body.replaceChildren(...this.hostPanel(hosting));
    else if (game.status === "connected" || game.status === "reconnecting") this.body.replaceChildren(...this.playerPanel(game));
    else if (game.status === "connecting" || game.status === "waiting") this.body.replaceChildren(...this.waitingPanel(game));
    else this.body.replaceChildren(...this.startPanel(v));
  }

  // ---------- Not in a game ----------

  private startPanel(v: SessionView): Node[] {
    const join = h("button", { class: "secondary", onclick: () => this.join() }, "Join game");
    const nodes: Node[] = [
      h("p", { class: "sheet-lead" }, "Play with your group. Rolls you make in a game show up for everyone at the table."),
      this.identityFields,
      h("h3", { class: "sheet-heading" }, "Join a game"),
      field("Invitation link from your GM", this.invite),
      h("div", { class: "sheet-row end" }, join),
    ];
    if (v.hosting) {
      const start: HTMLButtonElement = h(
        "button",
        { class: "secondary", disabled: this.busy, onclick: () => void this.hostStart(start) },
        "Host a game",
      );
      nodes.push(
        h("h3", { class: "sheet-heading" }, "Host a game"),
        h("p", { class: "muted" }, "Runs on this computer while this browser is open. You'll get a link to send your players."),
        h("div", { class: "sheet-row end" }, start),
      );
    }
    return nodes;
  }

  private join(): void {
    const identity = this.identity();
    if (!this.checkIdentity(identity)) return;
    const problem = this.actions.join(this.invite.value, identity);
    if (problem) return this.showError(problem);
    this.error.hidden = true;
  }

  private async hostStart(button: HTMLButtonElement): Promise<void> {
    const identity = this.identity();
    if (!this.checkIdentity(identity)) return;
    this.error.hidden = true;
    this.busy = true;
    button.disabled = true;
    try {
      await this.actions.hostStart(identity);
    } catch (e) {
      if (e instanceof HostNotInstalledError) this.showHostMissing();
      else this.showError(e instanceof Error ? e.message : String(e));
    } finally {
      this.busy = false;
      button.disabled = false;
    }
  }

  private checkIdentity(identity: Identity): boolean {
    if (!identity.playerName) {
      this.showError("Enter your name so the table knows who rolled.");
      this.playerName.focus();
      return false;
    }
    if (!identity.characterName) {
      this.showError("Enter your character's name.");
      this.characterName.focus();
      return false;
    }
    return true;
  }

  // ---------- Joining ----------

  private waitingPanel(game: GameState): Node[] {
    return [
      h(
        "p",
        { class: "room-status" },
        game.status === "waiting" ? "Waiting for the GM to let you in…" : "Connecting to the GM's game…",
      ),
      h("div", { class: "sheet-row end" }, h("button", { class: "secondary", onclick: () => this.actions.leave() }, "Cancel")),
    ];
  }

  // ---------- In a game ----------

  private playerPanel(game: Extract<GameState, { status: "connected" | "reconnecting" }>): Node[] {
    const connected = game.status === "connected";
    const me = connected ? game.me : null;
    const online = connected ? game.players.filter((p) => p.online) : [];
    return [
      h(
        "p",
        { class: "room-status" },
        h("span", { class: "dot", dataset: { state: connected ? "open" : "connecting" } }),
        connected ? "Connected to GM" : `Reconnecting… (try ${game.attempt})`,
      ),
      me &&
        h(
          "dl",
          { class: "facts" },
          h("dt", {}, "Character"),
          h("dd", {}, me.characterName),
          me.characterClass && h("dt", {}, "Class"),
          me.characterClass && h("dd", {}, me.characterClass),
          h("dt", {}, "Players online"),
          h("dd", {}, String(online.length)),
        ),
      connected && this.playerList(game.players, false),
      h("div", { class: "sheet-row end" }, h("button", { class: "secondary", onclick: () => this.actions.leave() }, "Leave game")),
    ].filter(Boolean) as Node[];
  }

  // ---------- Hosting (GM) ----------

  private hostPanel(host: HostStatus): Node[] {
    if (host.state !== "ready") {
      return [h("p", { class: "room-status" }, h("span", { class: "dot", dataset: { state: "connecting" } }), HOST_STEPS[host.state] ?? "Working…")];
    }
    const copy = h(
      "button",
      {
        class: "text-button",
        onclick: async () => {
          await navigator.clipboard?.writeText(host.inviteUrl ?? "").catch(() => undefined);
          copy.textContent = "Copied";
        },
      },
      "Copy invitation link",
    );
    const end: HTMLButtonElement = h(
      "button",
      {
        class: "secondary danger",
        onclick: async () => {
          end.disabled = true;
          await this.actions.hostStop().catch((e: unknown) => this.showError(String(e)));
        },
      },
      "End session",
    );
    return [
      h(
        "div",
        { class: "room-code-row" },
        h("span", { class: "room-code", "aria-label": `Room ${(host.roomCode ?? "").split("").join(" ")}` }, host.roomCode ?? ""),
        h("span", { class: "muted" }, "You're the GM"),
      ),
      field("Invitation", h("input", { class: "field invite-field", type: "text", readOnly: true, value: host.inviteUrl ?? "", onfocus: (e: FocusEvent) => (e.target as HTMLInputElement).select() })),
      h("div", { class: "sheet-row end" }, copy),
      host.requests.length > 0 &&
        h(
          "div",
          { class: "requests", role: "group", "aria-label": "Players asking to join" },
          ...host.requests.map((r) =>
            h(
              "div",
              { class: "request" },
              h("span", {}, h("strong", {}, r.playerName), ` wants to join as ${characterLabel(r)}`),
              h(
                "span",
                { class: "request-actions" },
                h("button", { class: "secondary small", onclick: () => this.actions.approve(r.requestId) }, "Let in"),
                h("button", { class: "text-button", onclick: () => this.actions.deny(r.requestId) }, "Turn away"),
              ),
            ),
          ),
        ),
      this.playerList(host.players, true),
      h("p", { class: "muted fine" }, "Quick Tunnels are meant for casual play. The link changes every session."),
      h("div", { class: "sheet-row end" }, end),
    ].filter(Boolean) as Node[];
  }

  private playerList(players: PlayerInfo[], canKick: boolean): HTMLElement {
    if (!players.length) return h("p", { class: "muted" }, "No players yet. Send them the invitation link.");
    return h(
      "ul",
      { class: "players", "aria-label": "Players" },
      ...players.map((p) =>
        h(
          "li",
          { class: "player", dataset: { online: String(p.online) } },
          h("span", { class: "dot", dataset: { state: p.online ? "open" : "closed" } }),
          h("span", { class: "player-name" }, `${p.playerName} / ${characterLabel(p)}`),
          p.isGm && h("span", { class: "tag" }, "GM"),
          canKick &&
            !p.isGm &&
            h("button", { class: "text-button", "aria-label": `Remove ${p.playerName} from the game`, onclick: () => this.actions.kick(p.playerId) }, "Remove"),
        ),
      ),
    );
  }

  private showError(message: string): void {
    this.error.replaceChildren(message);
    this.error.hidden = false;
  }

  /** The GM hasn't installed the host companion: where to get it and how, in a few steps. */
  private showHostMissing(): void {
    this.error.replaceChildren(
      h("span", {}, "Hosting needs the free Genesys host companion on this computer (Windows, with Node.js 20 or newer)."),
      h(
        "ol",
        { class: "host-steps" },
        h("li", {}, h("a", { href: HOST_DOWNLOAD_URL, target: "_blank", rel: "noopener noreferrer" }, "Download the host companion"), " (the genesys-host zip)."),
        h("li", {}, "Unzip it and run install-host.ps1, as its README.txt explains."),
        h("li", {}, "Restart your browser, then choose Host a game again."),
      ),
    );
    this.error.hidden = false;
  }
}

function field(label: string, input: HTMLElement, hint?: string): HTMLElement {
  return h("label", { class: "field-label" }, h("span", {}, label, hint && h("span", { class: "muted" }, ` ${hint}`)), input);
}
