import type { Characteristic, SkillDefinition } from "../setting";

/**
 * A skill with an id made from its name, so the same skill in two settings
 * ("Melee (Heavy)" in core and Terrinoth) shares one id and one rank.
 * Æ becomes "ae", so KeyForge's Æmbercraft is "aembercraft".
 */
export const skill = (name: string, characteristic: Characteristic, category: string): SkillDefinition => ({
  id: name.toLowerCase().replace(/æ/g, "ae").replace(/[^a-z]+/g, "-").replace(/^-|-$/g, ""),
  name,
  characteristic,
  category,
});
