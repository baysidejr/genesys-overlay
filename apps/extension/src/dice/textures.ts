// Face artwork, drawn on canvases at runtime with the Genesys symbol font
// (genesys.woff2, see FONT-LICENSE.md).

import * as THREE from "three";
import { FACES, type DieType } from "@genesys/shared";
import fontUrl from "./genesys.woff2?inline";
import { faceSymbols, GLYPH } from "./glyphs";

interface DieStyle {
  fill: string;
  edge: string;
  ink: string;
}

export const DIE_STYLE: Record<DieType, DieStyle> = {
  boost: { fill: "#8fd3f4", edge: "#5aa9cf", ink: "#10222c" },
  setback: { fill: "#1e1e22", edge: "#000000", ink: "#f2f2f2" },
  ability: { fill: "#3fa34d", edge: "#2a7a36", ink: "#0d1f10" },
  difficulty: { fill: "#5b2c8f", edge: "#3e1a66", ink: "#f4ecff" },
  proficiency: { fill: "#f2c230", edge: "#c99a12", ink: "#2a1f00" },
  challenge: { fill: "#b3202a", edge: "#7d1018", ink: "#fff1f1" },
};

export const FONT_FAMILY = "Genesys Overlay Symbols";
let fontLoad: Promise<void> | null = null;

/** Faces can only be drawn once this resolves. Safe to call repeatedly. */
export function loadSymbolFont(): Promise<void> {
  fontLoad ??= (async () => {
    const font = new FontFace(FONT_FAMILY, `url(${fontUrl})`);
    await font.load();
    document.fonts.add(font);
  })();
  return fontLoad;
}

const SIZE = 256;
const cache = new Map<string, THREE.CanvasTexture>();

/**
 * Texture for one FACES entry of a die. `inset` is the face's inradius over
 * its circumradius, so symbols stay inside triangles and pentagons alike.
 * Call loadSymbolFont() first.
 */
export function faceTexture(type: DieType, faceIndex: number, inset: number): THREE.Texture {
  const key = `${type}:${faceIndex}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const style = DIE_STYLE[type];
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = style.fill;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Darker rim toward the face's edges.
  const half = SIZE / 2;
  const rim = ctx.createRadialGradient(half, half, half * inset * 0.85, half, half, half);
  rim.addColorStop(0, "rgba(0,0,0,0)");
  rim.addColorStop(1, style.edge);
  ctx.fillStyle = rim;
  ctx.fillRect(0, 0, SIZE, SIZE);

  const glyphs = faceSymbols(FACES[type][faceIndex]!)
    .map((s) => GLYPH[s])
    .join("");
  if (glyphs) {
    // Fit the symbols inside the face's inscribed circle.
    const safe = half * inset * 0.9;
    let fontSize = safe * (glyphs.length === 1 ? 1.5 : 1.1);
    ctx.font = `${fontSize}px "${FONT_FAMILY}"`;
    const fit = (safe * 1.75) / ctx.measureText(glyphs).width;
    if (fit < 1) {
      fontSize *= fit;
      ctx.font = `${fontSize}px "${FONT_FAMILY}"`;
    }
    const m = ctx.measureText(glyphs);
    ctx.fillStyle = style.ink;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(glyphs, half, half + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  cache.set(key, texture);
  return texture;
}
