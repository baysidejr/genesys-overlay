// The Genesys symbol font (genesys.woff2) draws each symbol from a letter.

import type { Face } from "@genesys/shared";

export type DieSymbol = "success" | "advantage" | "triumph" | "failure" | "threat" | "despair";

export const GLYPH: Record<DieSymbol, string> = {
  success: "s",
  advantage: "a",
  triumph: "t",
  failure: "f",
  threat: "h",
  despair: "d",
};

/** Symbols on a face in reading order: triumph/despair, then success/failure, then advantage/threat. */
export function faceSymbols(face: Face): DieSymbol[] {
  const out: DieSymbol[] = [];
  const add = (symbol: DieSymbol, count = 0) => {
    for (let i = 0; i < count; i++) out.push(symbol);
  };
  add("triumph", face.triumph);
  add("despair", face.despair);
  add("success", face.success);
  add("failure", face.failure);
  add("advantage", face.advantage);
  add("threat", face.threat);
  return out;
}
