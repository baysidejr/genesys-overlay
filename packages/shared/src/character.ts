// Characters are plain data, independent of any sheet style.

import type { Characteristic } from "./setting";

export interface Weapon {
  name: string;
  skillId: string;
  damage: number;
  crit: number;
  range: string;
  special: string;
}

export interface Talent {
  name: string;
  page?: string;
  summary: string;
  active: boolean;
  /** Pyramid placement. */
  tier?: 1 | 2 | 3 | 4 | 5;
  /** Specialization tree placement. */
  tree?: { specialization: string; row: number; column: number };
}

export interface CriticalInjury {
  severity: string;
  result: string;
}

/** A skill the GM adds for their campaign, written into the sheet's Custom Skills box. */
export interface CustomSkill {
  name: string;
  characteristic: Characteristic;
  rank: number;
  career: boolean;
}

/** Realms of Terrinoth's heroic ability, with the points spent upgrading it. */
export interface HeroicAbility {
  name: string;
  origin: string;
  ability: string;
  upgrades: string;
  effect: string;
  totalPoints: number;
  availablePoints: number;
}

/** An optional extra a caster can add to a spell, at the cost of more difficulty. */
export interface SpellOption {
  name: string;
  /** Extra difficulty dice it adds to the check. */
  difficulty: number;
  text: string;
}

/** A spell the character usually casts, as on the pregenerated characters' spell sheets. */
export interface Spell {
  name: string;
  /** The magic skill used to cast it (arcana, divine, primal, runes, verse). */
  skillId: string;
  /** The magic action: Attack, Augment, Barrier, Heal... */
  action: string;
  /** Effects already built into the spell. */
  effects: string;
  /** Difficulty dice of the base check, 1 (Easy) to 5 (Formidable). */
  difficulty: number;
  text: string;
  options: SpellOption[];
}

/** A KeyForge Æffect: a lasting power from the Æmber, with its type and what it does. */
export interface Effect {
  name: string;
  type: string;
  power: string;
}

/** A weapon mounted on a vehicle, fired with the crew member's skill. */
export interface VehicleWeapon {
  name: string;
  skillId: string;
  firingArc: string;
  damage: number;
  crit: number;
  range: string;
  special: string;
}

/** The character's vehicle, as on KeyForge's vehicle sheet. */
export interface Vehicle {
  name: string;
  makeModel: string;
  controlSkill: string;
  details: string;
  silhouette: number;
  maxSpeed: number;
  /** -3 to +3: boost or setback dice on control checks. */
  handling: number;
  armor: number;
  hullTrauma: { threshold: number; current: number };
  systemStrain: { threshold: number; current: number };
  defense: { fore: number; port: number; starboard: number; aft: number };
  weapons: VehicleWeapon[];
  encumbrance: string;
  consumables: string;
  cargo: string;
  crew: string;
  passengers: string;
}

export interface Character {
  id: string;
  settingId: string;
  name: string;
  player: string;
  species: string;
  career: string;
  specializations: string[];
  characteristics: Record<Characteristic, number>;
  /** Skill id to rank. */
  skillRanks: Record<string, number>;
  careerSkills: string[];
  soak: number;
  wounds: { threshold: number; current: number };
  strain: { threshold: number; current: number };
  defense: { melee: number; ranged: number };
  xp: { total: number; available: number };
  weapons: Weapon[];
  talents: Talent[];
  criticalInjuries: CriticalInjury[];
  motivations: { strength: string; flaw: string; desire: string; fear: string };
  /** secondCurrency is used by settings with two kinds of money (KeyForge's Æmber). */
  equipment: { weaponsAndArmor: string; personalGear: string; currency: number; secondCurrency: number };
  /** Keyed by the setting's description fields. */
  description: Record<string, string>;
  notes: string;
  customSkills: CustomSkill[];
  /** Used by settings with a heroic ability block (Terrinoth). */
  heroicAbility: HeroicAbility;
  spells: Spell[];
  /** Used by settings with an effects block (KeyForge's Æffects). */
  effects: Effect[];
  /** Used by settings with a vehicle sheet (KeyForge). */
  vehicle: Vehicle;
}
