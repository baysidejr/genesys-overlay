// Turns a roll result into what players read: the outcome, a plain-language
// breakdown, and the net symbols to draw with the Genesys font.

import type { RollResult } from "@genesys/shared";
import { GLYPH } from "../dice/glyphs";

export interface Outcome {
  passed: boolean;
  headline: "Success" | "Failure";
  /** e.g. "2 successes, 1 advantage, triumph" or "No net successes". */
  detail: string;
  /** Font glyphs for the positive and negative net symbols. */
  good: string;
  bad: string;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function describe(result: RollResult): Outcome {
  const passed = result.success > 0;
  const parts: string[] = [];
  if (result.success > 0) parts.push(plural(result.success, "success", "successes"));
  if (result.success < 0) parts.push(plural(-result.success, "failure", "failures"));
  if (result.advantage > 0) parts.push(`${result.advantage} advantage`);
  if (result.advantage < 0) parts.push(`${-result.advantage} threat`);
  if (result.triumph) parts.push(result.triumph === 1 ? "triumph" : `${result.triumph} triumphs`);
  if (result.despair) parts.push(result.despair === 1 ? "despair" : `${result.despair} despairs`);

  const repeat = (glyph: string, n: number) => glyph.repeat(Math.max(n, 0));
  return {
    passed,
    headline: passed ? "Success" : "Failure",
    detail: parts.length ? capitalize(parts.join(", ")) : "Everything cancelled out",
    good:
      repeat(GLYPH.triumph, result.triumph) +
      repeat(GLYPH.success, result.success) +
      repeat(GLYPH.advantage, result.advantage),
    bad:
      repeat(GLYPH.despair, result.despair) +
      repeat(GLYPH.failure, -result.success) +
      repeat(GLYPH.threat, -result.advantage),
  };
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
