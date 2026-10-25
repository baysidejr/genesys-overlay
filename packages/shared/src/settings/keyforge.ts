import type { SettingDefinition } from "../setting";
import { skill } from "./skill";

/**
 * KeyForge: Secrets of the Crucible. Æmbercraft is its magic skill and sits
 * with the general skills, as on the printed sheet; melee is one skill;
 * Knowledge splits into Æmber, Crucible, Culture and Science. Characters
 * carry Æffects, keep Æmbits and Æmber, and may have a vehicle.
 */
export const keyforgeSetting: SettingDefinition = {
  id: "keyforge",
  name: "KeyForge",
  skillCategories: ["General", "Combat", "Social", "Knowledge"],
  skills: [
    skill("Æmbercraft", "willpower", "General"),
    skill("Athletics", "brawn", "General"),
    skill("Computers", "intellect", "General"),
    skill("Cool", "presence", "General"),
    skill("Coordination", "agility", "General"),
    skill("Discipline", "willpower", "General"),
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
    skill("Brawl", "brawn", "Combat"),
    skill("Gunnery", "agility", "Combat"),
    skill("Melee", "brawn", "Combat"),
    skill("Ranged", "agility", "Combat"),
    skill("Charm", "presence", "Social"),
    skill("Coercion", "willpower", "Social"),
    skill("Deception", "cunning", "Social"),
    skill("Leadership", "presence", "Social"),
    skill("Negotiation", "presence", "Social"),
    skill("Æmber", "intellect", "Knowledge"),
    skill("Crucible", "intellect", "Knowledge"),
    skill("Culture", "intellect", "Knowledge"),
    skill("Science", "intellect", "Knowledge"),
  ],
  currencyName: "Æmbits",
  secondCurrencyName: "Æmber",
  descriptionFields: ["Form", "Physiology", "Size & Shape", "Notable Features"],
  pages: [
    ["header", "characteristics", "derivedStats", "skills", "effects", "weapons"],
    ["motivations", "equipment", "description", "criticalInjuries", "talents"],
    ["talentPyramid"],
    ["vehicle"],
  ],
};
