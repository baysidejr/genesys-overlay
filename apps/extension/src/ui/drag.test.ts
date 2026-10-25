import { beforeEach, describe, expect, it } from "vitest";
import { clampPosition, isPosition, positionFromRect } from "./drag";

beforeEach(() => {
  Object.assign(globalThis, { innerWidth: 1280, innerHeight: 800 });
});

const rect = (x: number, y: number, w: number, h: number) =>
  ({ left: x, top: y, right: x + w, bottom: y + h, width: w, height: h }) as DOMRect;

describe("positionFromRect", () => {
  it("anchors to the nearest corner", () => {
    expect(positionFromRect(rect(20, 30, 300, 400))).toEqual({ h: "left", x: 20, v: "top", y: 30 });
    expect(positionFromRect(rect(900, 380, 360, 400))).toEqual({ h: "right", x: 20, v: "bottom", y: 20 });
  });
});

describe("clampPosition", () => {
  it("pulls a tray back on screen when it no longer fits", () => {
    // Saved on a big monitor, now shown in a small window.
    expect(clampPosition({ h: "right", x: 1100, v: "top", y: 700 }, 352, 500)).toEqual({
      h: "right",
      x: 1280 - 352 - 8,
      v: "top",
      y: 800 - 500 - 8,
    });
  });

  it("keeps the margin from the anchored edge", () => {
    expect(clampPosition({ h: "left", x: -40, v: "bottom", y: 0 }, 56, 56)).toMatchObject({ x: 8, y: 8 });
  });
});

describe("isPosition", () => {
  it("rejects damaged saved values", () => {
    expect(isPosition({ h: "left", x: 10, v: "top", y: 10 })).toBe(true);
    expect(isPosition({ h: "middle", x: 10, v: "top", y: 10 })).toBe(false);
    expect(isPosition({ h: "left", x: "10", v: "top", y: 10 })).toBe(false);
    expect(isPosition(null)).toBe(false);
  });
});
