// Runs on the GM's invitation page (https://<tunnel>.trycloudflare.com/join).
// Websites can't call extension APIs, so this content script does it: it
// saves the invitation for the dice tray and tells the player on the page.
// The invitation is kept in session storage, which clears when the browser closes.

import { parseInvite } from "@genesys/shared";
import { savePendingInvite } from "./ui/storage";

const status = document.getElementById("genesys-invite-status");
// Only act on the host's own landing page, not any page on the domain.
if (status && parseInvite(location.href)) {
  void savePendingInvite(location.href).then(() => {
    status.textContent = "Invitation saved. Open your tabletop, open the dice tray, and choose Join game.";
    status.dataset.state = "saved";
  });
}
