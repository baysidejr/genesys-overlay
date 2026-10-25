// Genesys narrative dice. The server rolls with these tables; the client
// uses the face index to put the right symbol on top of the 3D die.

export type DieType =
  | "boost"
  | "setback"
  | "ability"
  | "difficulty"
  | "proficiency"
  | "challenge";

export const DIE_TYPES: readonly DieType[] = [
  "boost",
  "setback",
  "ability",
  "difficulty",
  "proficiency",
  "challenge",
];

/** One face. Triumph also counts as a success, despair as a failure. */
export interface Face {
  success?: number;
  failure?: number;
  advantage?: number;
  threat?: number;
  triumph?: number;
  despair?: number;
}

const blank: Face = {};

export const FACES: Record<DieType, readonly Face[]> = {
  boost: [blank, blank, { success: 1 }, { success: 1, advantage: 1 }, { advantage: 2 }, { advantage: 1 }],
  setback: [blank, blank, { failure: 1 }, { failure: 1 }, { threat: 1 }, { threat: 1 }],
  ability: [
    blank,
    { success: 1 },
    { success: 1 },
    { success: 2 },
    { advantage: 1 },
    { advantage: 1 },
    { success: 1, advantage: 1 },
    { advantage: 2 },
  ],
  difficulty: [
    blank,
    { failure: 1 },
    { failure: 2 },
    { threat: 1 },
    { threat: 1 },
    { threat: 1 },
    { threat: 2 },
    { failure: 1, threat: 1 },
  ],
  proficiency: [
    blank,
    { success: 1 },
    { success: 1 },
    { success: 2 },
    { success: 2 },
    { advantage: 1 },
    { success: 1, advantage: 1 },
    { success: 1, advantage: 1 },
    { success: 1, advantage: 1 },
    { advantage: 2 },
    { advantage: 2 },
    { triumph: 1 },
  ],
  challenge: [
    blank,
    { failure: 1 },
    { failure: 1 },
    { failure: 2 },
    { failure: 2 },
    { threat: 1 },
    { threat: 1 },
    { failure: 1, threat: 1 },
    { failure: 1, threat: 1 },
    { threat: 2 },
    { threat: 2 },
    { despair: 1 },
  ],
};

/** How many of each die to roll. */
export type DicePool = Partial<Record<DieType, number>>;

export interface RolledDie {
  type: DieType;
  /** Index into FACES[type]. */
  face: number;
}

export interface RollResult {
  /** Net successes; above 0 means the check passed. */
  success: number;
  /** Net advantage; negative means net threat. */
  advantage: number;
  triumph: number;
  despair: number;
}

export const MAX_DICE_PER_TYPE = 20;

/** Returns an integer in [0, max). Must be uniform; the server passes a crypto RNG. */
export type RandomInt = (max: number) => number;

export function cryptoRandomInt(max: number): number {
  // Rejection sampling keeps the result uniform.
  const limit = Math.floor(0x1_0000_0000 / max) * max;
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    const n = buf[0]!;
    if (n < limit) return n % max;
  }
}

export function rollPool(pool: DicePool, randomInt: RandomInt = cryptoRandomInt): RolledDie[] {
  const dice: RolledDie[] = [];
  for (const type of DIE_TYPES) {
    const count = pool[type] ?? 0;
    for (let i = 0; i < count; i++) {
      dice.push({ type, face: randomInt(FACES[type].length) });
    }
  }
  return dice;
}

/** Every symbol showing before cancellation. Triumph also counts as a success, despair as a failure. */
export interface SymbolTally {
  success: number;
  failure: number;
  advantage: number;
  threat: number;
  triumph: number;
  despair: number;
}

export function tally(dice: readonly RolledDie[]): SymbolTally {
  const t: SymbolTally = { success: 0, failure: 0, advantage: 0, threat: 0, triumph: 0, despair: 0 };
  for (const { type, face } of dice) {
    const f = FACES[type][face];
    if (!f) throw new Error(`Invalid face ${face} for ${type}`);
    t.success += (f.success ?? 0) + (f.triumph ?? 0);
    t.failure += (f.failure ?? 0) + (f.despair ?? 0);
    t.advantage += f.advantage ?? 0;
    t.threat += f.threat ?? 0;
    t.triumph += f.triumph ?? 0;
    t.despair += f.despair ?? 0;
  }
  return t;
}

/** Applies Genesys cancellation: successes against failures, advantage against threat. */
export function summarize(dice: readonly RolledDie[]): RollResult {
  const t = tally(dice);
  return { success: t.success - t.failure, advantage: t.advantage - t.threat, triumph: t.triumph, despair: t.despair };
}

/**
 * The positive dice for a skill check. The higher of characteristic and rank
 * sets how many dice; the lower sets how many of those upgrade to
 * proficiency. Agility 3 with Ranged 2 rolls two proficiency and one ability.
 */
export function skillPool(characteristic: number, rank: number): DicePool {
  const high = Math.max(characteristic, rank, 0);
  const low = Math.max(Math.min(characteristic, rank), 0);
  return { proficiency: low, ability: high - low };
}

/** True if `dice` is exactly the dice of `pool`, each showing a real face. */
export function diceMatchPool(dice: unknown, pool: DicePool): dice is RolledDie[] {
  if (!Array.isArray(dice)) return false;
  const counts: Partial<Record<DieType, number>> = {};
  for (const die of dice) {
    if (typeof die !== "object" || die === null) return false;
    const { type, face } = die as RolledDie;
    if (!DIE_TYPES.includes(type)) return false;
    if (!Number.isInteger(face) || face < 0 || face >= FACES[type].length) return false;
    counts[type] = (counts[type] ?? 0) + 1;
  }
  return DIE_TYPES.every((t) => (counts[t] ?? 0) === (pool[t] ?? 0));
}

export function isValidPool(pool: unknown): pool is DicePool {
  if (typeof pool !== "object" || pool === null) return false;
  let total = 0;
  for (const [key, value] of Object.entries(pool)) {
    if (!DIE_TYPES.includes(key as DieType)) return false;
    if (!Number.isInteger(value) || value < 0 || value > MAX_DICE_PER_TYPE) return false;
    total += value;
  }
  return total > 0;
}
