import type { SettingDefinition } from "../setting";
import { skill } from "./skill";

/**
 * Realms of Terrinoth (gns03_player_sheets and the pregenerated
 * characters). Fantasy skills only: no vehicles, computers or guns; Runes and
 * Verse join the magic skills; Knowledge splits into four skills; Silver for
 * money; and a Heroic Ability.
 */
export const terrinothSetting: SettingDefinition = {
  id: "terrinoth",
  name: "Realms of Terrinoth",
  skillCategories: ["General", "Magic", "Combat", "Social", "Knowledge"],
  skills: [
    skill("Alchemy", "intellect", "General"),
    skill("Athletics", "brawn", "General"),
    skill("Cool", "presence", "General"),
    skill("Coordination", "agility", "General"),
    skill("Discipline", "willpower", "General"),
    skill("Mechanics", "intellect", "General"),
    skill("Medicine", "intellect", "General"),
    skill("Perception", "cunning", "General"),
    skill("Resilience", "brawn", "General"),
    skill("Riding", "agility", "General"),
    skill("Skulduggery", "cunning", "General"),
    skill("Stealth", "agility", "General"),
    skill("Streetwise", "cunning", "General"),
    skill("Survival", "cunning", "General"),
    skill("Vigilance", "willpower", "General"),
    skill("Arcana", "intellect", "Magic"),
    skill("Divine", "willpower", "Magic"),
    skill("Primal", "cunning", "Magic"),
    skill("Runes", "intellect", "Magic"),
    skill("Verse", "presence", "Magic"),
    skill("Brawl", "brawn", "Combat"),
    skill("Melee (Heavy)", "brawn", "Combat"),
    skill("Melee (Light)", "brawn", "Combat"),
    skill("Ranged", "agility", "Combat"),
    skill("Charm", "presence", "Social"),
    skill("Coercion", "willpower", "Social"),
    skill("Deception", "cunning", "Social"),
    skill("Leadership", "presence", "Social"),
    skill("Negotiation", "presence", "Social"),
    skill("Adventuring", "intellect", "Knowledge"),
    skill("Forbidden", "intellect", "Knowledge"),
    skill("Lore", "intellect", "Knowledge"),
    skill("Geography", "intellect", "Knowledge"),
  ],
  currencyName: "Silver",
  descriptionFields: ["Gender", "Age", "Height", "Build", "Hair", "Eyes", "Notable Features"],
  pages: [
    ["header", "characteristics", "derivedStats", "skills", "weapons"],
    ["motivations", "equipment", "heroicAbility", "criticalInjuries", "talents", "description"],
    ["talentPyramid"],
  ],
};
