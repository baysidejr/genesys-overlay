Genesys Overlay host companion
=============================

Lets a game master (GM) host a Genesys Overlay game from their own Windows
computer. Only the GM needs this. Players just install the Genesys Overlay
browser extension and open the invitation link the GM sends them.


What you need
-------------

- Windows 10 or 11
- Google Chrome or Microsoft Edge, with the Genesys Overlay extension installed
- Node.js 20 or newer: download the LTS version from https://nodejs.org and
  install it with the default options


Install (once)
--------------

1. Unzip this folder anywhere, for example in Downloads.
2. Open the unzipped folder in File Explorer, click the address bar, type
   powershell and press Enter. A PowerShell window opens in this folder.
3. Paste this line and press Enter:

     powershell -ExecutionPolicy Bypass -File .\install-host.ps1

4. Restart your browser.

The installer:
- copies the host to %LOCALAPPDATA%\GenesysOverlay\host
- downloads cloudflared (Cloudflare's tunnel program) from Cloudflare's
  GitHub releases, and keeps it only if its checksum and Cloudflare's code
  signature both match
- lets only the Genesys Overlay extension start the host, for your Windows
  user only. It needs no administrator rights.

After installing, you can delete the unzipped folder.


Host a game
-----------

1. Open your table on Alchemy RPG.
2. In the dice tray, click "Play together", then "Host a game".
3. Copy the invitation link and send it to your players.
4. When someone asks to join, choose "Let in" or "Turn away".
5. "End session" disconnects everyone.

The invitation link changes every session.


Updating
--------

Download the new release, unzip it and run install-host.ps1 again.


Uninstall
---------

In this folder, run:

  powershell -ExecutionPolicy Bypass -File .\uninstall-host.ps1


Troubleshooting
---------------

- "Node.js was not found": install Node.js from https://nodejs.org, then
  open a new PowerShell window and run the installer again.
- "Host a game" says the host isn't installed: restart the browser after
  installing. Run the installer again after updating the extension.
- Windows warns about running a downloaded script: the
  "-ExecutionPolicy Bypass" part of the command allows it for this run only.
