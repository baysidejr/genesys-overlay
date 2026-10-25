import { describe, expect, it } from "vitest";
import { FACES, isValidPool, rollPool, summarize } from "./dice";

describe("summarize", () => {
  it("nets successes against failures and advantage against threat", () => {
    const result = summarize([
      { type: "ability", face: 3 }, // 2 success
      { type: "difficulty", face: 7 }, // 1 failure, 1 threat
      { type: "boost", face: 4 }, // 2 advantage
    ]);
    expect(result).toEqual({ success: 1, advantage: 1, triumph: 0, despair: 0 });
  });

  it("counts triumph as a success and despair as a failure", () => {
    const result = summarize([
      { type: "proficiency", face: 11 },
      { type: "challenge", face: 11 },
    ]);
    expect(result).toEqual({ success: 0, advantage: 0, triumph: 1, despair: 1 });
  });
});

describe("rollPool", () => {
  it("rolls each die with an in-range face", () => {
    const dice = rollPool({ ability: 2, proficiency: 1, setback: 3 });
    expect(dice).toHaveLength(6);
    for (const d of dice) {
      expect(d.face).toBeGreaterThanOrEqual(0);
      expect(d.face).toBeLessThan(FACES[d.type].length);
    }
  });
});

describe("isValidPool", () => {
  it("rejects unknown dice, negatives and empty pools", () => {
    expect(isValidPool({ ability: 1 })).toBe(true);
    expect(isValidPool({ force: 1 })).toBe(false);
    expect(isValidPool({ ability: -1 })).toBe(false);
    expect(isValidPool({})).toBe(false);
  });
});
