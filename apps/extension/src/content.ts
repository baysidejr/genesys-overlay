// Mounts the overlay on the tabletop page inside a Shadow DOM, so the page's
// CSS can't reach the overlay and ours can't reach the page.
//
// It runs on Alchemy RPG (from the manifest) and on sites the player turned
// on (registered by the background worker). Turning a site on also injects it
// into the open tab right away, so it may run twice there: only the first run
// mounts. Turning a site off removes the overlay from tabs open on it.

import { mountOverlay } from "./overlay";
import { isBuiltIn, sitePattern } from "./sites";

const HOST_ID = "genesys-overlay-host";
const scope = window as unknown as { genesysOverlay?: unknown };

if (!scope.genesysOverlay) {
  // Exposed for manual testing from the console.
  scope.genesysOverlay = mountOverlay(document.body);

  chrome.runtime.onMessage.addListener((msg: { type?: string; sites?: string[] }) => {
    if (msg?.type !== "sites.removed") return;
    const here = sitePattern(location.href);
    if (!here || isBuiltIn(here) || !msg.sites?.includes(here)) return;
    document.getElementById(HOST_ID)?.remove();
  });
}
