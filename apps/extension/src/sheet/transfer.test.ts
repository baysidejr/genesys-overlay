import { describe, expect, it } from "vitest";
import { coreSetting, createCharacter } from "@genesys/shared";
import { exportFileName, exportJson, parseImport, shareCode } from "./transfer";

const thorgar = () => {
  const c = createCharacter(coreSetting, "Thorgar the Bold");
  c.career = "Warrior";
  c.characteristics.brawn = 4;
  c.skillRanks = { athletics: 2, melee: 3 };
  c.careerSkills = ["athletics", "melee"];
  c.weapons = [{ name: "War Axe", skillId: "melee", damage: 6, crit: 3, range: "Engaged", special: "Vicious 1" }];
  return c;
};

describe("share codes", () => {
  it("round-trips a character and stay short enough to paste in chat", async () => {
    const c = thorgar();
    const code = await shareCode(c);
    expect(code.startsWith("GO1:")).toBe(true);
    expect(code.length).toBeLessThan(1500);
    expect(await parseImport(code)).toEqual(c);
  });

  it("survives line breaks added by chat apps", async () => {
    const c = thorgar();
    const code = await shareCode(c);
    const wrapped = code.slice(0, 40) + "\n" + code.slice(40);
    expect(await parseImport(wrapped)).toEqual(c);
  });

  it("returns null for damaged codes instead of throwing", async () => {
    expect(await parseImport("GO1:not-a-real-code")).toBeNull();
    expect(await parseImport("hello")).toBeNull();
    expect(await parseImport("")).toBeNull();
  });
});

describe("export files", () => {
  it("round-trips through the exported JSON", async () => {
    const c = thorgar();
    expect(await parseImport(exportJson(c))).toEqual(c);
    expect(exportFileName(c)).toBe("thorgar-the-bold.genesys.json");
  });

  it("also accepts a bare character, cleaned up", async () => {
    const imported = await parseImport(JSON.stringify({ name: "Bare", characteristics: { brawn: 12 } }));
    expect(imported?.characteristics.brawn).toBe(6);
  });
});
