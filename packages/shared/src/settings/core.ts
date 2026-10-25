import type { SettingDefinition } from "../setting";
import { skill } from "./skill";

/**
 * The core rulebook sheet (genesys_character_sheet.pdf). It lists every core
 * skill; a campaign picks the ones its setting uses.
 */
export const coreSetting: SettingDefinition = {
  id: "core",
  name: "Genesys core",
  skillCategories: ["General", "Magic", "Combat", "Social", "Knowledge"],
  skills: [
    skill("Alchemy", "intellect", "General"),
    skill("Astrocartography", "intellect", "General"),
    skill("Athletics", "brawn", "General"),
    skill("Computers", "intellect", "General"),
    skill("Cool", "presence", "General"),
    skill("Coordination", "agility", "General"),
    skill("Discipline", "willpower", "General"),
    skill("Driving", "agility", "General"),
    skill("Mechanics", "intellect", "General"),
    skill("Medicine", "intellect", "General"),
    skill("Operating", "intellect", "General"),
    skill("Perception", "cunning", "General"),
    skill("Piloting", "agility", "General"),
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
    skill("Brawl", "brawn", "Combat"),
    skill("Gunnery", "agility", "Combat"),
    skill("Melee", "brawn", "Combat"),
    skill("Melee (Heavy)", "brawn", "Combat"),
    skill("Melee (Light)", "brawn", "Combat"),
    skill("Ranged", "agility", "Combat"),
    skill("Ranged (Heavy)", "agility", "Combat"),
    skill("Ranged (Light)", "agility", "Combat"),
    skill("Charm", "presence", "Social"),
    skill("Coercion", "willpower", "Social"),
    skill("Deception", "cunning", "Social"),
    skill("Leadership", "presence", "Social"),
    skill("Negotiation", "presence", "Social"),
    skill("Knowledge", "intellect", "Knowledge"),
  ],
  currencyName: "Money",
  descriptionFields: ["Gender", "Age", "Height", "Build", "Hair", "Eyes", "Notable Features"],
  pages: [
    ["header", "characteristics", "derivedStats", "skills", "weapons"],
    ["motivations", "equipment", "criticalInjuries", "talents", "description"],
    ["talentPyramid"],
  ],
};
