// The card that announces a roll: yours once the dice land, or another
// player's when their result arrives.

import type { FeedEntry } from "../multiplayer/game";
import { h } from "./dom";
import { describe } from "./outcome";

const SHOW_MS = 7000;

/** "Thorgar (Warrior)", or just the name without a class. */
export function characterLabel(e: Pick<FeedEntry, "characterName" | "characterClass">): string {
  return e.characterClass ? `${e.characterName} (${e.characterClass})` : e.characterName;
}

export class ResultCard {
  readonly el = h("div", { class: "results", "aria-live": "polite" });
  private timer: ReturnType<typeof setTimeout> | null = null;

  show(entry: FeedEntry): void {
    const outcome = describe(entry.results);
    const who = entry.self ? "You" : characterLabel(entry);
    const meta = entry.label ? `${who} rolled ${entry.label}` : `${who} rolled`;

    const card = h(
      "button",
      {
        class: "result",
        dataset: { passed: String(outcome.passed) },
        "aria-label": `${meta}: ${outcome.headline}. ${outcome.detail}. Click to dismiss.`,
        onclick: () => this.dismiss(),
      },
      h(
        "span",
        { class: "result-meta" },
        meta,
        !entry.self && h("span", { class: "result-by" }, `Rolled by ${entry.playerName}`),
        entry.hidden && h("span", { class: "tag" }, "Hidden"),
      ),
      h(
        "span",
        { class: "result-main" },
        h("span", { class: "result-word" }, outcome.headline),
        outcome.good && h("span", { class: "glyphs good" }, outcome.good),
        outcome.bad && h("span", { class: "glyphs bad" }, outcome.bad),
      ),
      h("span", { class: "result-detail" }, outcome.detail),
    );

    this.el.replaceChildren(card);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.dismiss(), SHOW_MS);
  }

  dismiss(): void {
    const card = this.el.firstElementChild as HTMLElement | null;
    if (!card) return;
    card.dataset.leaving = "";
    setTimeout(() => card.remove(), 180);
  }
}
