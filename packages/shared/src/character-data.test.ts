import { describe, expect, it } from "vitest";
import type { Talent } from "./character";
import { createCharacter, pyramidProblems, sanitizeCharacter, talentXp } from "./character-data";
import { skillPool } from "./dice";
import { coreSetting, keyforgeSetting, terrinothSetting } from "./settings";

describe("skillPool", () => {
  it("follows the Genesys rule: higher sets the dice, lower upgrades them", () => {
    expect(skillPool(3, 2)).toEqual({ proficiency: 2, ability: 1 });
    expect(skillPool(2, 3)).toEqual({ proficiency: 2, ability: 1 });
    expect(skillPool(2, 0)).toEqual({ proficiency: 0, ability: 2 });
    expect(skillPool(4, 4)).toEqual({ proficiency: 4, ability: 0 });
  });
});

describe("createCharacter", () => {
  it("starts with every characteristic at 2", () => {
    const c = createCharacter(coreSetting, "Thorgar");
    expect(Object.values(c.characteristics)).toEqual([2, 2, 2, 2, 2, 2]);
    expect(c.id).toMatch(/^c_[0-9a-f]{18}$/);
  });
});

describe("sanitizeCharacter", () => {
  it("keeps a valid character as it is", () => {
    const c = createCharacter(coreSetting, "Thorgar");
    c.skillRanks = { athletics: 2 };
    c.careerSkills = ["athletics"];
    c.weapons = [{ name: "Axe", skillId: "melee", damage: 5, crit: 3, range: "Engaged", special: "Vicious 1" }];
    c.talents = [{ name: "Grit", page: "73", summary: "+1 strain threshold", active: false, tier: 1 }];
    c.criticalInjuries = [{ severity: "Hard", result: "Crippled arm" }];
    c.motivations.strength = "Fearless";
    expect(sanitizeCharacter(JSON.parse(JSON.stringify(c)), coreSetting)).toEqual(c);
  });

  it("clamps, trims and drops what doesn't belong", () => {
    const c = sanitizeCharacter(
      {
        name: "x".repeat(500),
        characteristics: { brawn: 99, agility: -3, intellect: "4" },
        skillRanks: { athletics: 9, "made-up": 3, cool: 0 },
        careerSkills: ["cool", "made-up", 7],
        wounds: { threshold: 14, current: 500 },
        weapons: [{ name: "Gun", skillId: "nope", damage: "lots", range: "Orbit" }],
        xp: { total: 100, available: 400 },
        notes: "<script>alert(1)</script>",
        __proto__: { admin: true },
      },
      coreSetting,
    )!;
    expect(c.name).toHaveLength(80);
    expect(c.characteristics).toMatchObject({ brawn: 6, agility: 1, intellect: 2 });
    expect(c.skillRanks).toEqual({ athletics: 5 });
    expect(c.careerSkills).toEqual(["cool"]);
    expect(c.wounds).toEqual({ threshold: 14, current: 99 });
    expect(c.weapons[0]).toEqual({ name: "Gun", skillId: "", damage: 0, crit: 0, range: "Engaged", special: "" });
    expect(c.xp).toEqual({ total: 100, available: 100 });
    // Text stays text; the sheet never renders it as HTML.
    expect(c.notes).toBe("<script>alert(1)</script>");
    expect((c as unknown as { admin?: boolean }).admin).toBeUndefined();
  });

  it("rejects things that aren't characters", () => {
    expect(sanitizeCharacter(null, coreSetting)).toBeNull();
    expect(sanitizeCharacter([1, 2], coreSetting)).toBeNull();
    expect(sanitizeCharacter({ hello: "world" }, coreSetting)).toBeNull();
  });
});

describe("talent pyramid", () => {
  const t = (tier: 1 | 2 | 3 | 4 | 5): Talent => ({ name: `T${tier}`, summary: "", active: false, tier });

  it("costs 5 XP times the tier", () => {
    expect(talentXp([t(1), t(1), t(2), t(3)])).toBe(5 + 5 + 10 + 15);
  });

  it("needs more talents in each tier than the tier above", () => {
    expect(pyramidProblems([t(1), t(1), t(2)])).toEqual([]);
    expect(pyramidProblems([t(1), t(2)])).toEqual([{ tier: 2, below: 1, needed: 2 }]);
    expect(pyramidProblems([t(1), t(1), t(1), t(2), t(2), t(3), t(3)])).toEqual([{ tier: 3, below: 2, needed: 3 }]);
    expect(pyramidProblems([t(3)])).toEqual([{ tier: 3, below: 0, needed: 2 }]);
  });
});

describe("settings", () => {
  it("reads the setting from the character and keeps Terrinoth's own skills and extras", () => {
    const c = createCharacter(terrinothSetting, "Alys Raine");
    c.skillRanks = { "melee-heavy": 3, divine: 2, geography: 1 };
    c.customSkills = [{ name: "Sailing", characteristic: "agility", rank: 1, career: true }];
    c.heroicAbility = { name: "Relentless Marshall", origin: "Driven", ability: "Miraculous Recovery", upgrades: "Improved, Story", effect: "Heals.", totalPoints: 2, availablePoints: 0 };
    c.spells = [{ name: "Mercy of Kellos", skillId: "divine", action: "Heal", effects: "Restoration", difficulty: 2, text: "Heal one target.", options: [{ name: "Range", difficulty: 1, text: "One more range band." }] }];
    const back = sanitizeCharacter(JSON.parse(JSON.stringify(c)))!;
    expect(back).toEqual(c);
    expect(back.settingId).toBe("terrinoth");
  });

  it("keeps ranks for skills another setting knows, so switching settings loses nothing", () => {
    const c = createCharacter(coreSetting, "Switcher");
    c.skillRanks = { geography: 2, computers: 1 };
    expect(sanitizeCharacter(JSON.parse(JSON.stringify(c)))!.skillRanks).toEqual({ geography: 2, computers: 1 });
  });

  it("Terrinoth drops the sci-fi skills and adds Runes, Verse and four Knowledge skills", () => {
    const ids = terrinothSetting.skills.map((s) => s.id);
    expect(ids).not.toContain("computers");
    expect(ids).not.toContain("gunnery");
    expect(ids).toEqual(expect.arrayContaining(["runes", "verse", "adventuring", "forbidden", "lore", "geography"]));
    expect(terrinothSetting.currencyName).toBe("Silver");
  });

  it("KeyForge keeps its Æ skills, Æffects, both currencies and a vehicle", () => {
    const ids = keyforgeSetting.skills.map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(["aembercraft", "aember", "crucible", "culture", "science", "operating", "melee"]));
    expect(ids).not.toContain("melee-heavy");

    const c = createCharacter(keyforgeSetting, "Quixo");
    c.skillRanks = { aembercraft: 2, aember: 1 };
    c.effects = [{ name: "Lifeward", type: "Protection", power: "Shrug off one critical injury." }];
    c.equipment.currency = 120;
    c.equipment.secondCurrency = 3;
    c.description = { Form: "Brobnar", Physiology: "Giant", "Size & Shape": "Huge", "Notable Features": "" };
    c.vehicle.name = "Cloudrunner";
    c.vehicle.handling = -1;
    c.vehicle.defense = { fore: 1, port: 0, starboard: 0, aft: 1 };
    c.vehicle.weapons = [{ name: "Æmber cannon", skillId: "gunnery", firingArc: "Forward", damage: 6, crit: 3, range: "Short", special: "" }];
    expect(sanitizeCharacter(JSON.parse(JSON.stringify(c)))).toEqual(c);
  });

  it("keeps description fields from another setting, so switching back loses nothing", () => {
    const c = createCharacter(coreSetting, "Switcher");
    c.description.Hair = "Red";
    c.settingId = "keyforge";
    expect(sanitizeCharacter(JSON.parse(JSON.stringify(c)))!.description.Hair).toBe("Red");
  });

  it("clamps vehicle numbers from untrusted data", () => {
    const raw = { ...createCharacter(keyforgeSetting), vehicle: { handling: 9, maxSpeed: -2, weapons: [{ range: "Orbit", skillId: "hacking" }] } };
    const v = sanitizeCharacter(raw)!.vehicle;
    expect(v.handling).toBe(3);
    expect(v.maxSpeed).toBe(0);
    expect(v.weapons[0]).toMatchObject({ range: "Close", skillId: "" });
  });
});
