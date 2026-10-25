// Small die silhouettes for the interface, shaped like the 3D dice: a square
// for d6, a diamond for d8, a pentagon for d12. Two tones suggest facets.

import type { DieType } from "@genesys/shared";
import { DIE_KIND } from "../dice/polyhedra";
import { DIE_STYLE } from "../dice/textures";
import { svg } from "./dom";

const PENTAGON = (r: number) =>
  Array.from({ length: 5 }, (_, i) => {
    const a = (i * 2 * Math.PI) / 5 - Math.PI / 2;
    return `${(12 + Math.cos(a) * r).toFixed(2)},${(12.6 + Math.sin(a) * r).toFixed(2)}`;
  }).join(" ");

export function gem(type: DieType, size = 22): SVGSVGElement {
  const { fill, edge } = DIE_STYLE[type];
  const shapes = {
    d6: `<rect x="3.5" y="3.5" width="17" height="17" rx="3.5" fill="${edge}"/>
         <path d="M7 3.5h10a3.5 3.5 0 0 1 3.5 3.5v0L12 12 3.5 7a3.5 3.5 0 0 1 3.5-3.5z" fill="${fill}"/>
         <path d="M3.5 7 12 12v8.5H7A3.5 3.5 0 0 1 3.5 17z" fill="${fill}" opacity=".78"/>`,
    d8: `<path d="M12 1.5 22.5 12 12 22.5 1.5 12z" fill="${edge}"/>
         <path d="M12 1.5V22.5L1.5 12z" fill="${fill}"/>`,
    d12: `<polygon points="${PENTAGON(11)}" fill="${edge}"/>
          <polygon points="${PENTAGON(6.2)}" fill="${fill}"/>`,
  }[DIE_KIND[type]];
  return svg(
    `<svg class="gem" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">${shapes}</svg>`,
  );
}
