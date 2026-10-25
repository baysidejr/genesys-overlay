// The dice tray: builds a pool, rolls it, manages the room, keeps a log.

import type { DicePool, DieType } from "@genesys/shared";
import type { FeedEntry } from "../multiplayer/game";
import { h, svg } from "./dom";
import {
  applyPosition,
  clampPosition,
  DEFAULT_POSITION,
  makeDraggable,
  positionFromRect,
  type TrayPosition,
} from "./drag";
import { gem } from "./gems";
import { describe } from "./outcome";
import { characterLabel } from "./result";
import { SessionSheet, type SessionActions, type SessionView } from "./session-sheet";

/** Not in a game (status idle or ended): rolls are practice and only this player sees them. */
export type TrayView = SessionView;

export interface TrayActions {
  roll(pool: DicePool, options: { label?: string; hidden: boolean }): void;
  session: SessionActions;
  /** How many pixels the open tray covers from each side of the screen (0 when collapsed). */
  onCoverChange(cover: { left: number; right: number }): void;
  /** The player moved the tray; remember it. */
  onMove(pos: TrayPosition): void;
  /** Shows or hides the character sheet. */
  toggleSheet(): void;
  /** The player turned dice sounds on or off; remember it. */
  onSoundChange(on: boolean): void;
}

const ROWS: DieType[][] = [
  ["ability", "proficiency", "boost"],
  ["difficulty", "challenge", "setback"],
];

const NAMES: Record<DieType, string> = {
  ability: "Ability",
  proficiency: "Proficiency",
  boost: "Boost",
  difficulty: "Difficulty",
  challenge: "Challenge",
  setback: "Setback",
};

const MAX_PER_TYPE = 10;
const LOG_LIMIT = 30;

const icon = {
  sound: (on: boolean) =>
    svg(
      on
        ? '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"><path d="M3 8h3l4-3.5v11L6 12H3z"/><path d="M13 7.5a3.5 3.5 0 0 1 0 5M15.3 5.2a6.7 6.7 0 0 1 0 9.6"/></svg>'
        : '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"><path d="M3 8h3l4-3.5v11L6 12H3z"/><path d="M13 8l4 4M17 8l-4 4"/></svg>',
    ),
  collapse: () =>
    svg(`<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`),
  grip: () =>
    svg(`<svg viewBox="0 0 10 16" width="10" height="16" aria-hidden="true" fill="currentColor"><circle cx="2.5" cy="3" r="1.4"/><circle cx="7.5" cy="3" r="1.4"/><circle cx="2.5" cy="8" r="1.4"/><circle cx="7.5" cy="8" r="1.4"/><circle cx="2.5" cy="13" r="1.4"/><circle cx="7.5" cy="13" r="1.4"/></svg>`),
  sheet: () =>
    svg(`<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M5 2.5h7l3.5 3.5v11.5H5z"/><path d="M12 2.5V6h3.5M7.5 9.5h5M7.5 12.5h5M7.5 15h3"/></svg>`),
  launcher: () =>
    svg(`<svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true"><path d="M12 1.5 22.5 12 12 22.5 1.5 12z" fill="#2f8a3c"/><path d="M12 1.5V22.5L1.5 12z" fill="#4cb05a"/><path d="m12 7.2 1.1 2.4 2.5-.9-.9 2.5 2.4 1.1-2.4 1.1.9 2.5-2.5-.9-1.1 2.4-1.1-2.4-2.5.9.9-2.5-2.4-1.1 2.4-1.1-.9-2.5 2.5.9z" fill="#0d1f10"/></svg>`),
};

export class Tray {
  readonly el: HTMLElement;
  private readonly pool = new Map<DieType, number>();
  private view: TrayView = {
    game: { status: "idle" },
    hosting: null,
    identity: { playerName: "", characterName: "" },
    pendingInvite: null,
  };
  private open = true;
  /** Where the player put the tray; it's shown pulled back on screen if needed. */
  private position: TrayPosition = DEFAULT_POSITION;

  private readonly panel: HTMLElement;
  private readonly launcher: HTMLButtonElement;
  private readonly hand: HTMLElement;
  private readonly chips = new Map<DieType, { count: HTMLElement; remove: HTMLButtonElement; root: HTMLElement }>();
  private readonly label: HTMLInputElement;
  private readonly hiddenToggle: HTMLLabelElement;
  private readonly hiddenInput: HTMLInputElement;
  private readonly rollButton: HTMLButtonElement;
  private readonly soundButton: HTMLButtonElement;
  private soundOn = true;
  private readonly roomChip: HTMLButtonElement;
  private readonly session: SessionSheet;
  private readonly notice: HTMLElement;
  private readonly log: HTMLOListElement;

  constructor(private readonly actions: TrayActions) {
    this.launcher = h(
      "button",
      {
        class: "launcher",
        "aria-label": "Open dice tray",
        "aria-expanded": "false",
        onclick: (e: MouseEvent) => this.setOpen(true, e.detail === 0),
      },
      icon.launcher(),
    );

    this.roomChip = h("button", {
      class: "room-chip",
      "aria-expanded": "false",
      onclick: () => this.toggleRoomSheet(),
    });

    this.hand = h("div", { class: "hand", "aria-live": "polite" });

    const rows = ROWS.map((row) =>
      h("div", { class: "chip-row" }, ...row.map((type) => this.chip(type))),
    );

    this.label = h("input", {
      class: "field label-field",
      type: "text",
      placeholder: "What's this roll for?",
      "aria-label": "Roll label",
      maxLength: 80,
      onkeydown: (e: KeyboardEvent) => {
        if (e.key === "Enter") this.roll();
      },
    });
    this.hiddenInput = h("input", { type: "checkbox", class: "switch-input" });
    this.hiddenToggle = h(
      "label",
      { class: "switch", title: "Only you see hidden rolls" },
      this.hiddenInput,
      h("span", { class: "switch-track", "aria-hidden": "true" }),
      "Hidden",
    );
    this.rollButton = h("button", { class: "roll", onclick: () => this.roll() });

    this.session = new SessionSheet(actions.session);
    this.notice = h("p", { class: "notice", role: "alert", hidden: true });
    this.log = h("ol", { class: "log", "aria-label": "Recent rolls" });

    const grip = h(
      "button",
      {
        class: "grip",
        title: "Drag to move. Double-click to put it back in the corner.",
        "aria-label": "Move dice tray with the arrow keys",
        onkeydown: (e: KeyboardEvent) => this.nudge(e),
        ondblclick: () => this.moveTo(DEFAULT_POSITION),
      },
      icon.grip(),
    );
    this.soundButton = h("button", {
      class: "icon-button sound-toggle",
      onclick: () => {
        this.setSoundOn(!this.soundOn);
        this.actions.onSoundChange(this.soundOn);
      },
    });
    this.setSoundOn(true);
    const head = h(
      "header",
      { class: "panel-head" },
      grip,
      h("h2", { class: "title" }, "Dice"),
      this.roomChip,
      this.soundButton,
      h(
        "button",
        {
          class: "icon-button sheet-toggle",
          "aria-label": "Show or hide the character sheet",
          title: "Character sheet",
          onclick: () => this.actions.toggleSheet(),
        },
        icon.sheet(),
      ),
      h(
        "button",
        {
          class: "icon-button",
          "aria-label": "Collapse dice tray",
          onclick: (e: MouseEvent) => this.setOpen(false, e.detail === 0),
        },
        icon.collapse(),
      ),
    );

    this.panel = h(
      "section",
      { class: "panel", "aria-label": "Dice tray" },
      head,
      this.session.el,
      h(
        "div",
        { class: "builder" },
        this.hand,
        ...rows,
        h("div", { class: "roll-bar" }, this.label, this.hiddenToggle, this.rollButton),
        this.notice,
      ),
      this.log,
    );

    this.el = h("div", { class: "tray" }, this.panel, this.launcher);
    makeDraggable(this.el, [head, grip, this.launcher], (pos) => this.moveTo(pos));
    window.addEventListener("resize", () => this.place());
    this.render();
    this.renderLogEmpty();
  }

  /** Shows whether dice sounds are on. Restoring a saved choice doesn't report it back. */
  setSoundOn(on: boolean): void {
    this.soundOn = on;
    this.soundButton.replaceChildren(icon.sound(on));
    this.soundButton.setAttribute("aria-pressed", String(on));
    this.soundButton.setAttribute("aria-label", "Dice sounds");
    this.soundButton.title = on ? "Dice sounds on" : "Dice sounds off";
  }

  /** Restores a saved position without reporting it back as a move. */
  setPosition(pos: TrayPosition): void {
    this.position = pos;
    this.place();
  }

  private moveTo(pos: TrayPosition): void {
    this.position = pos;
    this.place();
    this.actions.onMove(pos);
  }

  /** Arrow keys on the grip move the tray; Shift moves it further. */
  private nudge(e: KeyboardEvent): void {
    const step = e.shiftKey ? 64 : 16;
    const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!delta) return;
    e.preventDefault();
    const r = this.el.getBoundingClientRect();
    this.moveTo(positionFromRect(new DOMRect(r.x + delta[0]!, r.y + delta[1]!, r.width, r.height)));
  }

  /** Shows the tray at its position, pulled back on screen if it would spill off. */
  private place(): void {
    applyPosition(this.el, this.position);
    // Measure at the remembered spot, then clamp to the current size.
    const r = this.el.getBoundingClientRect();
    if (r.width) applyPosition(this.el, clampPosition(this.position, r.width, r.height));
    this.reportCover();
  }

  private reportCover(): void {
    const r = this.panel.getBoundingClientRect();
    if (!this.open || !r.width) return this.actions.onCoverChange({ left: 0, right: 0 });
    const gap = 16;
    const onLeft = r.left + r.width / 2 < innerWidth / 2;
    this.actions.onCoverChange(
      onLeft ? { left: r.right + gap, right: 0 } : { left: 0, right: innerWidth - r.left + gap },
    );
  }

  setView(view: TrayView): void {
    const ended = view.game.status === "ended" && this.view.game.status !== "ended";
    this.view = view;
    this.session.update(view);
    // Make sure a player sees why their game ended.
    if (ended && this.session.el.hidden) this.toggleRoomSheet();
    this.render();
  }

  /**
   * Replaces the pool with a check from the character sheet and labels it,
   * so the player only adds difficulty and rolls.
   */
  loadPool(pool: DicePool, label: string): void {
    this.pool.clear();
    for (const [type, n] of Object.entries(pool) as [DieType, number][]) {
      if (n > 0) this.pool.set(type, Math.min(n, MAX_PER_TYPE));
    }
    this.label.value = label;
    this.notice.hidden = true;
    if (!this.open) this.setOpen(true, false);
    else this.render();
    this.hand.dataset.flash = "";
    setTimeout(() => delete this.hand.dataset.flash, 400);
  }

  /** Opens the multiplayer sheet, e.g. when an invitation is waiting. */
  openSession(): void {
    if (this.session.el.hidden) this.toggleRoomSheet();
  }

  /** Shows a problem under the roll button until the next action. */
  showNotice(text: string): void {
    this.notice.textContent = text;
    this.notice.hidden = false;
  }

  /** Adds a roll to the shared feed, newest first, in time order even when history arrives late. */
  addLog(entry: FeedEntry): void {
    const outcome = describe(entry.results);
    const time = entry.time.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    this.log.querySelector(".log-empty")?.remove();
    const item = h(
      "li",
      { class: "log-item", dataset: { passed: String(outcome.passed), at: String(entry.time.getTime()) } },
      h(
        "span",
        { class: "log-line" },
        h("span", { class: "log-who" }, characterLabel(entry)),
        h("span", { class: "log-player" }, entry.self ? "You" : entry.playerName),
        entry.hidden && h("span", { class: "tag" }, "Hidden"),
        h("time", { class: "log-time", dateTime: entry.time.toISOString() }, time),
      ),
      h(
        "span",
        { class: "log-line" },
        // Always present, even empty, so the verdict lines up on the right.
        h("span", { class: "log-label" }, entry.label ?? ""),
        h("span", { class: "log-verdict" }, outcome.headline),
        outcome.good && h("span", { class: "glyphs good" }, outcome.good),
        outcome.bad && h("span", { class: "glyphs bad" }, outcome.bad),
      ),
    );
    item.title = outcome.detail;
    const newer = [...this.log.children].find((li) => Number((li as HTMLElement).dataset.at) <= entry.time.getTime());
    this.log.insertBefore(item, newer ?? null);
    while (this.log.children.length > LOG_LIMIT) this.log.lastElementChild!.remove();
    this.place();
  }

  clearLog(): void {
    this.renderLogEmpty();
    this.place();
  }

  private chip(type: DieType): HTMLElement {
    const count = h("span", { class: "chip-count", "aria-hidden": "true" });
    const remove = h(
      "button",
      { class: "chip-remove", "aria-label": `Remove one ${NAMES[type]} die`, onclick: () => this.change(type, -1) },
      "−",
    );
    const root = h(
      "div",
      { class: "chip", dataset: { type } },
      h(
        "button",
        {
          class: "chip-add",
          "aria-label": `Add ${NAMES[type]} die`,
          onclick: () => this.change(type, 1),
          oncontextmenu: (e: MouseEvent) => {
            e.preventDefault();
            this.change(type, -1);
          },
        },
        gem(type, 26),
        h("span", { class: "chip-name" }, NAMES[type]),
      ),
      count,
      remove,
    );
    this.chips.set(type, { count, remove, root });
    return root;
  }

  private change(type: DieType, delta: number): void {
    const next = Math.max(0, Math.min(MAX_PER_TYPE, (this.pool.get(type) ?? 0) + delta));
    if (next) this.pool.set(type, next);
    else this.pool.delete(type);
    this.notice.hidden = true;
    this.render();
  }

  private poolSize(): number {
    let n = 0;
    for (const v of this.pool.values()) n += v;
    return n;
  }

  private roll(): void {
    if (!this.poolSize()) return;
    const label = this.label.value.trim() || undefined;
    this.notice.hidden = true;
    this.actions.roll(Object.fromEntries(this.pool), {
      label,
      hidden: this.isGm() && this.hiddenInput.checked,
    });
    this.label.value = "";
  }

  /** Keyboard users get focus moved into or out of the panel; mouse users keep theirs. */
  private setOpen(open: boolean, fromKeyboard: boolean): void {
    this.open = open;
    this.render();
    if (fromKeyboard) (open ? this.panel.querySelector<HTMLElement>(".chip-add") : this.launcher)?.focus();
  }

  private isGm(): boolean {
    return this.view.game.status === "connected" && this.view.game.me.isGm;
  }

  private toggleRoomSheet(): void {
    if (this.session.el.hidden) this.session.open();
    else this.session.close();
    this.roomChip.setAttribute("aria-expanded", String(!this.session.el.hidden));
    this.place();
  }

  /** The chip in the header: what kind of game this is and how the connection is doing. */
  private chipState(): { dot: string; text: string; label: string } {
    const { game, hosting } = this.view;
    if (hosting && hosting.state !== "idle" && hosting.state !== "ready") {
      return { dot: "connecting", text: "Starting…", label: "Starting a hosted game. Game settings" };
    }
    switch (game.status) {
      case "connected":
        return {
          dot: "open",
          text: `${game.me.isGm ? "Hosting" : "Room"} ${game.roomCode}`,
          label: `In game ${game.roomCode} with ${game.players.filter((p) => p.online).length} online. Game settings`,
        };
      case "reconnecting":
        return { dot: "connecting", text: "Reconnecting…", label: "Reconnecting to the game. Game settings" };
      case "connecting":
      case "waiting":
        return { dot: "connecting", text: "Joining…", label: "Joining a game. Game settings" };
      case "ended":
        return { dot: "closed", text: "Disconnected", label: "Disconnected from the game. Game settings" };
      default:
        return { dot: "practice", text: "Play together", label: "Play together: host or join a game. Until then, only you see your rolls" };
    }
  }

  private render(): void {
    this.el.dataset.open = String(this.open);
    this.launcher.setAttribute("aria-expanded", String(this.open));

    const chip = this.chipState();
    this.roomChip.replaceChildren(h("span", { class: "dot", dataset: { state: chip.dot } }), chip.text);
    this.roomChip.setAttribute("aria-label", chip.label);

    // Dice in hand, in the order they'll be rolled
    const dice = ROWS.flat().flatMap((type) => Array.from({ length: this.pool.get(type) ?? 0 }, () => type));
    this.hand.replaceChildren(
      ...(dice.length
        ? [
            h(
              "div",
              { class: "hand-dice" },
              ...dice.map((type) =>
                h(
                  "button",
                  { class: "hand-die", "aria-label": `Remove ${NAMES[type]} die`, onclick: () => this.change(type, -1) },
                  gem(type, 22),
                ),
              ),
            ),
            h("button", { class: "text-button", onclick: () => this.clearPool() }, "Clear"),
          ]
        : [h("p", { class: "hand-empty" }, "Tap dice below to build a pool")]),
    );

    for (const [type, chip] of this.chips) {
      const n = this.pool.get(type) ?? 0;
      chip.count.textContent = n ? String(n) : "";
      chip.root.dataset.active = String(n > 0);
      chip.remove.hidden = n === 0;
    }

    const size = dice.length;
    this.rollButton.disabled = size === 0;
    this.rollButton.textContent = size ? `Roll ${size} ${size === 1 ? "die" : "dice"}` : "Roll";
    this.hiddenToggle.hidden = !this.isGm();
    // The panel may have changed size; keep it on screen.
    this.place();
  }

  private clearPool(): void {
    this.pool.clear();
    this.render();
    this.panel.querySelector<HTMLElement>(".chip-add")?.focus();
  }

  private renderLogEmpty(): void {
    this.log.replaceChildren(h("li", { class: "log-empty" }, "Your rolls show up here. In a game, everyone's do."));
  }
}
