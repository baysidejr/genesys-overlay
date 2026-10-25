import { describe as group, expect, it } from "vitest";
import { describe } from "./outcome";

group("describe", () => {
  it("reads a success with advantage and triumph", () => {
    const o = describe({ success: 2, advantage: 1, triumph: 1, despair: 0 });
    expect(o.headline).toBe("Success");
    expect(o.detail).toBe("2 successes, 1 advantage, triumph");
    expect(o.good).toBe("tssa");
    expect(o.bad).toBe("");
  });

  it("reads a failure with threat and despair", () => {
    const o = describe({ success: -1, advantage: -2, triumph: 0, despair: 1 });
    expect(o.headline).toBe("Failure");
    expect(o.detail).toBe("1 failure, 2 threat, despair");
    expect(o.bad).toBe("dfhh");
  });

  it("treats zero net successes as a failure", () => {
    const o = describe({ success: 0, advantage: 0, triumph: 0, despair: 0 });
    expect(o.passed).toBe(false);
    expect(o.detail).toBe("Everything cancelled out");
  });
});
