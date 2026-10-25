# Chrome Web Store listing

Text and answers for the Chrome Web Store developer dashboard, plus a checklist before each submission.

## Before submitting

1. Bump `version` in `apps/extension/public/manifest.json`.
2. Run `pnpm package:store`. It writes `apps/extension/release/genesys-overlay-<version>-store.zip`, with the manifest's `key` removed.
3. The privacy policy is `PRIVACY.md`: https://github.com/baysidejr/genesys-overlay/blob/main/PRIVACY.md
4. Confirm you may redistribute `apps/extension/src/assets/sounds/standard-dice-roll.mp3`.
5. First upload only: once the store item exists, copy its extension ID into `$StoreExtensionId` in `packages/host/scripts/install-host.ps1`, commit it, and have GMs run the installer again.
6. Consider **Unlisted** visibility: only people with the link can install it.

## Store listing

**Name:** Genesys Overlay

**Summary** (the manifest description, 132 characters max):
Unofficial fan-made Genesys RPG dice and character sheets for Alchemy RPG and other VTTs. Not affiliated with Fantasy Flight Games.

**Description:**

> Roll Genesys narrative dice right on your virtual tabletop. Works on Alchemy RPG out of the box, and on any other tabletop you turn it on for: Roll20, Owlbear Rodeo, Foundry VTT and more.
>
> - 3D Genesys dice with the familiar symbols: ability, proficiency, boost, difficulty, challenge and setback.
> - Results added up for you: success or failure, advantage, threat, triumph and despair.
> - Character sheets for the Genesys core rules, Realms of Terrinoth and KeyForge, with click-to-roll skills, weapons and spells, the talent pyramid, and themes.
> - Play together: the GM hosts a game from their own computer and shares an invitation link. Everyone sees each roll. No accounts, and no server run by us.
> - Practice rolls work with no game at all, and stay on your screen.
>
> Using another tabletop: open it, click the Genesys Overlay icon in Chrome's toolbar and choose "Turn on for this site". Chrome asks once for that site only. Turn it off again from the same menu. The extension never runs on sites you haven't turned on.
>
> Hosting a game needs the free Genesys host companion on the GM's Windows computer: https://github.com/baysidejr/genesys-overlay/releases/latest. Players only need this extension.
>
> Unofficial fan-made tool. Not affiliated with, endorsed by or sponsored by Fantasy Flight Games, Edge Studio or Alchemy RPG. Genesys, Realms of Terrinoth and KeyForge are trademarks of their respective owners. No official artwork or logos are included.

**Category:** Lifestyle → Games. **Language:** English. **Mature content:** No.

**Images** (in [docs/store](store)):
- Store icon: `store-icon-128.png`
- Screenshots (1280×800 JPEG): `1-dice-roll.jpg`, `2-sheet-genesys.jpg`, `3-sheet-terrinoth.jpg`, `4-sheet-keyforge.jpg`, `5-spells-terrinoth.jpg`
- Small promo tile (440×280 PNG): `small-promo-tile.png`
- Marquee promo tile (1400×560 PNG): `marquee-promo-tile.png`

**Homepage URL:** https://github.com/baysidejr/genesys-overlay

**Support URL:** https://github.com/baysidejr/genesys-overlay/issues

## Privacy practices tab

**Single purpose:**
Rolling Genesys RPG dice and keeping Genesys character sheets on a virtual tabletop (Alchemy RPG, or any tabletop site the user turns it on for), alone or in a game hosted by the game master.

**Permission justifications:**

- `storage`: Saves the player's characters, preferences (sheet theme, sound on or off, tray position) and the game they're in, locally in the browser.
- `scripting`: Shows the overlay on tabletop sites the user has turned on from the toolbar popup. The extension registers its own bundled overlay script for exactly those sites, adds it to tabs already open on a site when it's turned on, and unregisters it when the site is turned off. It never runs on a site the user hasn't turned on.
- `activeTab`: When the user opens the toolbar popup, lets it read the current tab's address, so it can offer "Turn on for this site" for that site.
- Optional host permission `https://*/*`: Lets the user turn the overlay on for any tabletop site of their choosing, including self-hosted Foundry VTT servers whose addresses can't be known in advance. Nothing is granted at install: the popup asks Chrome for one site at a time (for example `https://app.roll20.net/*`) only when the user clicks "Turn on for this site", and the user can remove it from the same popup or from chrome://extensions.
- `nativeMessaging`: Lets a game master's browser start, control and stop the Genesys host companion, a program the GM installs on their own computer to host a game for their players. It's only used when the GM chooses "Host a game", and it talks only to that local program.
- Host permission `https://app.alchemyrpg.com/*`: Shows the dice tray, 3D dice and character sheet over the Alchemy RPG tabletop.
- Host permission `https://*.trycloudflare.com/join*`: Game invitations are links to the GM's Cloudflare Quick Tunnel, whose address is random each session. Opening one saves the invitation so the player can join from the dice tray.

**Remote code:** No. All JavaScript is in the package; nothing is loaded or evaluated from the network.

**Data usage** (what the extension handles):

- Personally identifiable information: **yes**. The player name you enter is sent to the GM's computer when you join a game.
- Website content: **yes**. Character names, careers, roll labels and dice results are sent to the GM's computer when you join a game.
- Not collected: health, financial, authentication, personal communications, location, web history or user activity.

**Certify:**
- Not sold to third parties: true.
- Not used or transferred for purposes unrelated to the single purpose: true.
- Not used or transferred to determine creditworthiness or for lending: true.

**Privacy policy URL:** https://github.com/baysidejr/genesys-overlay/blob/main/PRIVACY.md
