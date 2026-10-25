// What happens when someone rolls. Your own roll animates on your screen and
// is shared once it lands; other players' rolls arrive as finished results
// and only add a feed entry and a result card. No animation or sound is ever
// replayed for someone else's roll.

import {
  rollPool,
  summarize,
  tally,
  type DicePool,
  type DiceResultEvent,
  type RollResult,
  type RolledDie,
  type SymbolTally,
} from "@genesys/shared";
import type { GameClient, Identity } from "./client";

export interface FeedEntry {
  id: string;
  playerName: string;
  characterName: string;
  characterClass?: string;
  label?: string;
  dicePool: DicePool;
  symbols: SymbolTally;
  results: RollResult;
  time: Date;
  /** Rolled in this browser. */
  self: boolean;
  /** A GM roll kept off the table. */
  hidden: boolean;
}

export interface GameView {
  /** Plays the 3D roll for these dice; resolves when they've landed. */
  animate(roll: { id: string; dice: RolledDie[] }): Promise<void>;
  addToFeed(entry: FeedEntry): void;
  showResult(entry: FeedEntry): void;
  notice(message: string): void;
}

const randomId = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
};

export class Game {
  constructor(
    private readonly view: GameView,
    private readonly client: Pick<GameClient, "sendRoll" | "current">,
    private readonly identity: () => Identity,
    private readonly roll: (pool: DicePool) => RolledDie[] = rollPool,
  ) {}

  /** Rolls in this browser. Shared with the table afterwards unless hidden or not in a game. */
  async rollLocal(pool: DicePool, options: { label?: string; hidden?: boolean } = {}): Promise<FeedEntry> {
    const dice = this.roll(pool);
    const id = randomId();
    await this.view.animate({ id, dice });

    const state = this.client.current;
    const me = state.status === "connected" ? state.me : this.identity();
    const hidden = Boolean(options.hidden);
    const entry: FeedEntry = {
      id,
      playerName: me.playerName,
      characterName: me.characterName,
      characterClass: me.characterClass,
      label: options.label,
      dicePool: pool,
      symbols: tally(dice),
      results: summarize(dice),
      time: new Date(),
      self: true,
      hidden,
    };
    this.view.addToFeed(entry);
    this.view.showResult(entry);

    if (state.status === "connected" && !hidden) {
      const sent = this.client.sendRoll({ clientEventId: `r_${id}`, dicePool: pool, dice, label: options.label });
      if (!sent) this.view.notice("Lost the connection to the game, so that roll wasn't shared.");
    } else if (state.status === "reconnecting") {
      this.view.notice("Reconnecting to the game, so that roll wasn't shared.");
    }
    return entry;
  }

  /** A finished roll from another player: a feed entry and a card, nothing animated. */
  showRemote(event: DiceResultEvent, fromHistory: boolean): void {
    const entry: FeedEntry = {
      id: event.eventId,
      playerName: event.playerName,
      characterName: event.characterName,
      characterClass: event.characterClass,
      label: event.label,
      dicePool: event.dicePool,
      symbols: event.symbols,
      results: event.results,
      time: new Date(event.timestamp),
      self: false,
      hidden: false,
    };
    this.view.addToFeed(entry);
    // Old rolls from history fill the feed quietly.
    if (!fromHistory) this.view.showResult(entry);
  }
}
