import { describe, expect, it } from "vitest";
import { DIE_TYPES, FACES, rollPool, type DieType } from "@genesys/shared";
import { dieShape } from "./polyhedra";
import { mulberry32 } from "./rng";
import { planThrow, remapFaces, topFace, TRACK_STRIDE, type Arena } from "./simulate";

const arena: Arena = { minX: -7, maxX: 7, minZ: -4, maxZ: 5 };

describe("dieShape", () => {
  it.each(DIE_TYPES)("%s has one flat face per FACES entry", (type: DieType) => {
    expect(dieShape(type).faces).toHaveLength(FACES[type].length);
  });
});

describe("remapFaces", () => {
  it("puts the wanted entry on top and keeps a full set of faces", () => {
    const map = remapFaces(8, 2, 5);
    expect(map[2]).toBe(5);
    expect([...map].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });
});

describe("planThrow", () => {
  it("lands every die with the server's face on top", () => {
    const random = mulberry32(42);
    for (let roll = 0; roll < 30; roll++) {
      const pool = Object.fromEntries(DIE_TYPES.map((t) => [t, Math.floor(random() * 3)]));
      pool.ability = (pool.ability ?? 0) + 1;
      const dice = rollPool(pool, (max) => Math.floor(random() * max));
      const plan = planThrow(dice, arena, roll);

      dice.forEach((die, i) => {
        const track = plan.tracks[i]!;
        const o = (plan.steps - 1) * TRACK_STRIDE;
        const top = topFace(dieShape(die.type), {
          x: track[o + 3]!,
          y: track[o + 4]!,
          z: track[o + 5]!,
          w: track[o + 6]!,
        });
        expect(top.alignment).toBeGreaterThan(0.95);
        expect(plan.faceMaps[i]![top.face]).toBe(die.face);
      });
    }
  });

  it("replays the same throw for the same seed", () => {
    const dice = [
      { type: "proficiency", face: 11 },
      { type: "difficulty", face: 3 },
    ] as const;
    const a = planThrow(dice, arena, 7);
    const b = planThrow(dice, arena, 7);
    expect(a.steps).toBe(b.steps);
    expect(a.tracks).toEqual(b.tracks);
  });
});
