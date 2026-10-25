// A setting describes what a character sheet holds (skills, currency, blocks).
// Sheet styles only change how that is drawn. See the design doc.

export type Characteristic = "brawn" | "agility" | "intellect" | "cunning" | "willpower" | "presence";

export const CHARACTERISTICS: readonly Characteristic[] = [
  "brawn",
  "agility",
  "intellect",
  "cunning",
  "willpower",
  "presence",
];

export interface SkillDefinition {
  id: string;
  name: string;
  characteristic: Characteristic;
  category: string;
}

/** Building blocks a sheet can show. New blocks get added here. */
export type SheetBlock =
  | "header"
  | "characteristics"
  | "derivedStats"
  | "skills"
  | "weapons"
  | "effects"
  | "heroicAbility"
  | "motivations"
  | "equipment"
  | "criticalInjuries"
  | "talents"
  | "talentPyramid"
  | "specializationTrees"
  | "description"
  | "vehicle";

/** Chosen by the GM per campaign and locked once the campaign starts. */
export type TalentSystem = "pyramid" | "specializationTree";

export interface SettingDefinition {
  id: string;
  name: string;
  skillCategories: string[];
  skills: SkillDefinition[];
  currencyName: string;
  /** A second kind of money, like KeyForge's Æmber beside its Æmbits. */
  secondCurrencyName?: string;
  descriptionFields: string[];
  /** Blocks per sheet page, in order. */
  pages: SheetBlock[][];
}
