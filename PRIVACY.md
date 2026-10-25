# Genesys Overlay privacy policy

_Effective date: 25 October 2026. Last updated: 25 October 2026 (opt-in sites)._

Genesys Overlay is an unofficial, fan-made browser extension that adds Genesys RPG dice and character sheets to Alchemy RPG (app.alchemyrpg.com), and to other tabletop sites you choose to turn it on for. It is not affiliated with Fantasy Flight Games, Edge Studio or Alchemy RPG.

**In short:** the extension has no server of its own and no accounts. It collects no analytics and shows no ads. Your characters and settings stay in your browser. When you join a game, your name, your character's name and career, and your dice rolls go to the game master's computer, and to no one else.

## What stays in your browser

The extension saves these in your browser's extension storage (`chrome.storage`), on your computer only:

- characters you create or import, with everything on their sheets
- the name and character you play as
- your preferences: sheet theme, whether dice sounds are on, where the dice tray sits, whether the sheet was open
- while you're in a game: the invitation link and a sign-in ticket that lets you rejoin after a reload. These are kept only until the browser closes.

The developer never receives any of this. Uninstalling the extension deletes it.

Exporting a character or copying a share code puts that character into a file or onto your clipboard. Where it goes from there is up to you.

## What is shared when you play together

Games are hosted by a game master (GM) on their own computer, using the Genesys host companion. When you join a game with the GM's invitation link, the extension sends the GM's computer:

- your player name, your character's name and, if you've filled it in, your character's career
- each roll you make: the dice, the results, and the label you gave the roll, if any

The GM's computer then shows your name, character and rolls to the GM and to the other players in that game. The GM's computer keeps the game only in memory. Nothing is saved to disk, and it's all gone when the GM ends the session. Your character sheet itself is never sent.

### Cloudflare

To reach the GM's computer without router or firewall changes, the connection runs through a Cloudflare Quick Tunnel (an address ending in `trycloudflare.com`). The connection is encrypted (HTTPS/WSS) between your browser and Cloudflare, and Cloudflare relays it to the GM's computer. Like any network provider, Cloudflare handles your IP address and connection details. See [Cloudflare's privacy policy](https://www.cloudflare.com/privacypolicy/).

### Practice rolls

Outside a game, rolls are practice rolls. They're shown only on your screen and go nowhere.

## Permissions

- **storage:** saves your characters and preferences, as described above.
- **nativeMessaging:** lets a GM's browser start and control the host companion installed on the GM's own computer. It's used only when a GM chooses **Host a game**, and talks only to that local program.
- **Site access** to `app.alchemyrpg.com` (to show the dice and sheet there) and to invitation pages on `trycloudflare.com` (to save the link when you open an invitation).
- **Other sites, only if you turn them on:** from the toolbar button you can turn the overlay on for another tabletop. Chrome asks you to allow that one site. On it, the extension only draws its dice and sheet on top of the page. It doesn't read or collect the page's content. You can turn a site off again from the same button.
- **scripting and activeTab:** let the toolbar button see which site you're on, and show the overlay on the sites you've turned on.

## What the developer does not do

- No analytics, tracking, advertising or fingerprinting.
- No selling or sharing of data. The developer runs no server, so there is nothing to sell.
- No code loaded from the internet. Everything the extension runs is in the package you install.

## Children

The extension isn't directed at children under 13 and doesn't knowingly collect their information.

## Changes

If this policy changes, the new version will be published at this address with a new "Last updated" date.

## Contact

Questions or concerns: open an issue at https://github.com/baysidejr/genesys-overlay/issues.
