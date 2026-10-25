// Making new characters and checking characters that come from elsewhere
// (an imported file or a share code from another player). Imported data is
// never trusted: every field is type-checked, clamped and length-limited,
// and anything missing gets a default.

import type { Character, CriticalInjury, CustomSkill, Effect, Spell, Talent, Vehicle, VehicleWeapon, Weapon } from "./character";
import { CHARACTERISTICS, type Characteristic, type SettingDefinition } from "./setting";
import { SETTINGS, settingById } from "./settings";

export const WEAPON_RANGES = ["Engaged", "Short", "Medium", "Long", "Extreme"] as const;

/** Vehicle weapons fire at planetary range bands. */
export const VEHICLE_RANGES = ["Close", "Short", "Medium", "Long", "Extreme"] as const;

/** Critical injury severity is the difficulty of checks to recover: 1 to 4 difficulty dice. */
export const INJURY_SEVERITIES = ["Easy", "Average", "Hard", "Daunting"] as const;

export const TALENT_TIERS = [1, 2, 3, 4, 5] as const;
export type TalentTier = (typeof TALENT_TIERS)[number];

/** Each talent costs 5 XP times its tier. */
export const tierCost = (tier: TalentTier) => tier * 5;

export function talentsInTier(talents: readonly Talent[], tier: TalentTier): Talent[] {
  return talents.filter((t) => (t.tier ?? 1) === tier);
}

/** XP spent on talents in the pyramid. */
export function talentXp(talents: readonly Talent[]): number {
  return TALENT_TIERS.reduce((sum, tier) => sum + talentsInTier(talents, tier).length * tierCost(tier), 0);
}

/**
 * The pyramid rule: a character must have more talents in each tier than in
 * the tier above it. Returns the tiers that break it, with how many talents
 * the tier below has and needs.
 */
export function pyramidProblems(talents: readonly Talent[]): { tier: TalentTier; below: number; needed: number }[] {
  const problems: { tier: TalentTier; below: number; needed: number }[] = [];
  for (const tier of TALENT_TIERS.slice(1)) {
    const here = talentsInTier(talents, tier).length;
    const below = talentsInTier(talents, (tier - 1) as TalentTier).length;
    if (here > 0 && below <= here) problems.push({ tier, below, needed: here + 1 });
  }
  return problems;
}

const MAX_TEXT = 80;
const MAX_LONG_TEXT = 2000;
const MAX_WEAPONS = 20;
const MAX_LIST = 50;

export function newCharacterId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  return "c_" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** A blank character for a setting: every characteristic at 2, as a new Genesys character starts. */
export function createCharacter(setting: SettingDefinition, name = "New character"): Character {
  return {
    id: newCharacterId(),
    settingId: setting.id,
    name,
    player: "",
    species: "",
    career: "",
    specializations: [],
    characteristics: Object.fromEntries(CHARACTERISTICS.map((c) => [c, 2])) as Record<Characteristic, number>,
    skillRanks: {},
    careerSkills: [],
    soak: 2,
    wounds: { threshold: 10, current: 0 },
    strain: { threshold: 10, current: 0 },
    defense: { melee: 0, ranged: 0 },
    xp: { total: 0, available: 0 },
    weapons: [],
    talents: [],
    criticalInjuries: [],
    motivations: { strength: "", flaw: "", desire: "", fear: "" },
    equipment: { weaponsAndArmor: "", personalGear: "", currency: 0, secondCurrency: 0 },
    description: Object.fromEntries(setting.descriptionFields.map((f) => [f, ""])),
    notes: "",
    customSkills: [],
    heroicAbility: { name: "", origin: "", ability: "", upgrades: "", effect: "", totalPoints: 0, availablePoints: 0 },
    spells: [],
    effects: [],
    vehicle: newVehicle(),
  };
}

function newVehicle(): Vehicle {
  return {
    name: "",
    makeModel: "",
    controlSkill: "",
    details: "",
    silhouette: 0,
    maxSpeed: 0,
    handling: 0,
    armor: 0,
    hullTrauma: { threshold: 0, current: 0 },
    systemStrain: { threshold: 0, current: 0 },
    defense: { fore: 0, port: 0, starboard: 0, aft: 0 },
    weapons: [],
    encumbrance: "",
    consumables: "",
    cargo: "",
    crew: "",
    passengers: "",
  };
}

/** Magic skills a spell can be cast with. */
export const MAGIC_SKILLS = ["arcana", "divine", "primal", "runes", "verse", "aembercraft"] as const;

/** Check difficulty by number of difficulty dice. */
export const DIFFICULTIES = ["Easy", "Average", "Hard", "Daunting", "Formidable"] as const;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

const text = (v: unknown, max = MAX_TEXT): string =>
  typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").slice(0, max) : "";

const int = (v: unknown, min: number, max: number, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback;

/** Every skill id any setting knows, so switching a character's setting keeps its ranks. */
const KNOWN_SKILLS = new Set(SETTINGS.flatMap((s) => s.skills.map((k) => k.id)));

/** Every description field any setting has, kept for the same reason. */
const KNOWN_DESCRIPTION = [...new Set(SETTINGS.flatMap((s) => s.descriptionFields))];

/**
 * Rebuilds a character from untrusted data. Returns null if it isn't a
 * character at all. The setting comes from the character's own settingId
 * unless one is given; skills no setting knows are dropped.
 */
export function sanitizeCharacter(raw: unknown, settingOverride?: SettingDefinition): Character | null {
  if (!isRecord(raw) || typeof raw.name !== "string") return null;
  const setting = settingOverride ?? settingById(typeof raw.settingId === "string" ? raw.settingId : undefined);
  const base = createCharacter(setting, text(raw.name) || "Unnamed character");
  const skillIds = KNOWN_SKILLS;

  const characteristics = isRecord(raw.characteristics) ? raw.characteristics : {};
  const ranks = isRecord(raw.skillRanks) ? raw.skillRanks : {};
  const pair = (v: unknown, a: string, b: string, max: number) => {
    const r = isRecord(v) ? v : {};
    return [int(r[a], 0, max, 0), int(r[b], 0, max, 0)] as const;
  };
  const [woundThreshold, wounds] = pair(raw.wounds, "threshold", "current", 99);
  const [strainThreshold, strain] = pair(raw.strain, "threshold", "current", 99);
  const [melee, ranged] = pair(raw.defense, "melee", "ranged", 9);
  const [xpTotal, xpAvailable] = pair(raw.xp, "total", "available", 9999);

  const weapons: Weapon[] = (Array.isArray(raw.weapons) ? raw.weapons : [])
    .filter(isRecord)
    .slice(0, MAX_WEAPONS)
    .map((w) => ({
      name: text(w.name),
      skillId: typeof w.skillId === "string" && skillIds.has(w.skillId) ? w.skillId : "",
      damage: int(w.damage, 0, 99, 0),
      crit: int(w.crit, 0, 9, 0),
      range: WEAPON_RANGES.includes(w.range as (typeof WEAPON_RANGES)[number]) ? (w.range as string) : "Engaged",
      special: text(w.special, 200),
    }));

  const talents: Talent[] = (Array.isArray(raw.talents) ? raw.talents : [])
    .filter(isRecord)
    .slice(0, MAX_LIST)
    .map((t) => ({
      name: text(t.name),
      page: text(t.page, 20) || undefined,
      summary: text(t.summary, 500),
      active: t.active === true,
      tier: [1, 2, 3, 4, 5].includes(t.tier as number) ? (t.tier as Talent["tier"]) : undefined,
    }));

  const injuries: CriticalInjury[] = (Array.isArray(raw.criticalInjuries) ? raw.criticalInjuries : [])
    .filter(isRecord)
    .slice(0, MAX_LIST)
    .map((c) => ({
      severity: INJURY_SEVERITIES.includes(c.severity as (typeof INJURY_SEVERITIES)[number]) ? (c.severity as string) : "Easy",
      result: text(c.result, 200),
    }));

  const customSkills: CustomSkill[] = (Array.isArray(raw.customSkills) ? raw.customSkills : [])
    .filter(isRecord)
    .slice(0, 8)
    .map((s) => ({
      name: text(s.name, 40),
      characteristic: CHARACTERISTICS.includes(s.characteristic as Characteristic) ? (s.characteristic as Characteristic) : "intellect",
      rank: int(s.rank, 0, 5, 0),
      career: s.career === true,
    }));

  const spells: Spell[] = (Array.isArray(raw.spells) ? raw.spells : [])
    .filter(isRecord)
    .slice(0, 20)
    .map((s) => ({
      name: text(s.name),
      skillId: MAGIC_SKILLS.includes(s.skillId as (typeof MAGIC_SKILLS)[number]) ? (s.skillId as string) : "arcana",
      action: text(s.action, 40),
      effects: text(s.effects, 200),
      difficulty: int(s.difficulty, 1, 5, 2),
      text: text(s.text, MAX_LONG_TEXT),
      options: (Array.isArray(s.options) ? s.options : [])
        .filter(isRecord)
        .slice(0, 12)
        .map((o) => ({ name: text(o.name, 60), difficulty: int(o.difficulty, 0, 4, 1), text: text(o.text, 500) })),
    }));

  const effects: Effect[] = (Array.isArray(raw.effects) ? raw.effects : [])
    .filter(isRecord)
    .slice(0, 8)
    .map((e) => ({ name: text(e.name), type: text(e.type, 40), power: text(e.power, MAX_LONG_TEXT) }));

  const heroic = isRecord(raw.heroicAbility) ? raw.heroicAbility : {};
  const motivations = isRecord(raw.motivations) ? raw.motivations : {};
  const equipment = isRecord(raw.equipment) ? raw.equipment : {};
  const description = isRecord(raw.description) ? raw.description : {};

  return {
    ...base,
    id: typeof raw.id === "string" && /^c_[0-9a-f]{18}$/.test(raw.id) ? raw.id : base.id,
    player: text(raw.player),
    species: text(raw.species),
    career: text(raw.career),
    specializations: (Array.isArray(raw.specializations) ? raw.specializations : []).map((s) => text(s)).filter(Boolean).slice(0, 10),
    characteristics: Object.fromEntries(
      CHARACTERISTICS.map((c) => [c, int(characteristics[c], 1, 6, 2)]),
    ) as Record<Characteristic, number>,
    skillRanks: Object.fromEntries(
      Object.entries(ranks)
        .filter(([id]) => skillIds.has(id))
        .map(([id, r]) => [id, int(r, 0, 5, 0)])
        .filter(([, r]) => (r as number) > 0),
    ),
    careerSkills: (Array.isArray(raw.careerSkills) ? raw.careerSkills : []).filter(
      (id): id is string => typeof id === "string" && skillIds.has(id),
    ),
    soak: int(raw.soak, 0, 20, base.soak),
    wounds: { threshold: woundThreshold || base.wounds.threshold, current: wounds },
    strain: { threshold: strainThreshold || base.strain.threshold, current: strain },
    defense: { melee, ranged },
    xp: { total: xpTotal, available: Math.min(xpAvailable, xpTotal) },
    weapons,
    talents,
    criticalInjuries: injuries,
    motivations: {
      strength: text(motivations.strength, 200),
      flaw: text(motivations.flaw, 200),
      desire: text(motivations.desire, 200),
      fear: text(motivations.fear, 200),
    },
    equipment: {
      weaponsAndArmor: text(equipment.weaponsAndArmor, MAX_LONG_TEXT),
      personalGear: text(equipment.personalGear, MAX_LONG_TEXT),
      currency: int(equipment.currency, 0, 9_999_999, 0),
      secondCurrency: int(equipment.secondCurrency, 0, 9_999_999, 0),
    },
    description: Object.fromEntries(
      [...setting.descriptionFields, ...KNOWN_DESCRIPTION.filter((f) => typeof description[f] === "string" && description[f])].map((f) => [f, text(description[f], 200)]),
    ),
    notes: text(raw.notes, MAX_LONG_TEXT),
    customSkills,
    heroicAbility: {
      name: text(heroic.name),
      origin: text(heroic.origin),
      ability: text(heroic.ability),
      upgrades: text(heroic.upgrades, 200),
      effect: text(heroic.effect, MAX_LONG_TEXT),
      totalPoints: int(heroic.totalPoints, 0, 99, 0),
      availablePoints: int(heroic.availablePoints, 0, 99, 0),
    },
    spells,
    effects,
    vehicle: sanitizeVehicle(raw.vehicle, skillIds),
  };
}

function sanitizeVehicle(raw: unknown, skillIds: ReadonlySet<string>): Vehicle {
  const v = isRecord(raw) ? raw : {};
  const pair = (p: unknown) => {
    const r = isRecord(p) ? p : {};
    return { threshold: int(r.threshold, 0, 999, 0), current: int(r.current, 0, 999, 0) };
  };
  const d = isRecord(v.defense) ? v.defense : {};
  const weapons: VehicleWeapon[] = (Array.isArray(v.weapons) ? v.weapons : [])
    .filter(isRecord)
    .slice(0, MAX_WEAPONS)
    .map((w) => ({
      name: text(w.name),
      skillId: typeof w.skillId === "string" && skillIds.has(w.skillId) ? w.skillId : "",
      firingArc: text(w.firingArc, 40),
      damage: int(w.damage, 0, 99, 0),
      crit: int(w.crit, 0, 9, 0),
      range: VEHICLE_RANGES.includes(w.range as (typeof VEHICLE_RANGES)[number]) ? (w.range as string) : "Close",
      special: text(w.special, 200),
    }));
  return {
    name: text(v.name),
    makeModel: text(v.makeModel),
    controlSkill: text(v.controlSkill, 40),
    details: text(v.details, 200),
    silhouette: int(v.silhouette, 0, 10, 0),
    maxSpeed: int(v.maxSpeed, 0, 5, 0),
    handling: int(v.handling, -3, 3, 0),
    armor: int(v.armor, 0, 20, 0),
    hullTrauma: pair(v.hullTrauma),
    systemStrain: pair(v.systemStrain),
    defense: { fore: int(d.fore, 0, 4, 0), port: int(d.port, 0, 4, 0), starboard: int(d.starboard, 0, 4, 0), aft: int(d.aft, 0, 4, 0) },
    weapons,
    encumbrance: text(v.encumbrance, 200),
    consumables: text(v.consumables, 200),
    cargo: text(v.cargo, MAX_LONG_TEXT),
    crew: text(v.crew, MAX_LONG_TEXT),
    passengers: text(v.passengers, MAX_LONG_TEXT),
  };
}
