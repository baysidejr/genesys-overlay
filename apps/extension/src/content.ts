// Mounts the overlay on the Alchemy page inside a Shadow DOM, so Alchemy's
// CSS can't reach the overlay and ours can't reach Alchemy.

import { mountOverlay } from "./overlay";

const overlay = mountOverlay(document.body);
// Exposed for manual testing from the console until the roll UI exists.
(window as unknown as { genesysOverlay: unknown }).genesysOverlay = overlay;
