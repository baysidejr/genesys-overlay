// Interface fonts, bundled so the overlay never fetches anything at runtime.
// Fonts must be registered on the document: @font-face inside a shadow root
// is ignored by Chrome.

import barlow400 from "@fontsource/barlow/files/barlow-latin-400-normal.woff2?inline";
import barlow500 from "@fontsource/barlow/files/barlow-latin-500-normal.woff2?inline";
import barlow600 from "@fontsource/barlow/files/barlow-latin-600-normal.woff2?inline";
import condensed500 from "@fontsource/barlow-condensed/files/barlow-condensed-latin-500-normal.woff2?inline";
import condensed700 from "@fontsource/barlow-condensed/files/barlow-condensed-latin-700-normal.woff2?inline";
import { loadSymbolFont } from "../dice/textures";

/** Prefixed so they can't collide with fonts on the host page. */
export const TEXT_FONT = "Genesys Overlay Text";
export const DISPLAY_FONT = "Genesys Overlay Display";

const FACES: [family: string, url: string, weight: string][] = [
  [TEXT_FONT, barlow400, "400"],
  [TEXT_FONT, barlow500, "500"],
  [TEXT_FONT, barlow600, "600"],
  [DISPLAY_FONT, condensed500, "500"],
  [DISPLAY_FONT, condensed700, "700"],
];

let loading: Promise<void> | null = null;

export function loadFonts(): Promise<void> {
  loading ??= Promise.all([
    loadSymbolFont(),
    ...FACES.map(async ([family, url, weight]) => {
      const face = new FontFace(family, `url(${url})`, { weight });
      document.fonts.add(await face.load());
    }),
  ]).then(() => undefined);
  return loading;
}
