// Local preview of the overlay over a stand-in map, no Alchemy needed.
// Practice rolls work on their own; rooms need `pnpm dev:worker` running.

import { mountOverlay } from "../src/overlay";

const overlay = mountOverlay(document.body);
(window as unknown as { genesysOverlay: unknown }).genesysOverlay = overlay;
