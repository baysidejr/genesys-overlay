// The page a player sees when they open the invitation link in a browser.
// The extension's invite script fills in the "saved" state on this page.

export function landingPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Join the game</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #1c242e; color: #e6ebf0;
         font: 16px/1.5 system-ui, sans-serif; }
  main { max-width: 34rem; padding: 32px 24px; }
  h1 { margin: 0 0 12px; font-size: 1.9rem; line-height: 1.15; }
  ol { padding-left: 1.3rem; }
  li { margin: 6px 0; }
  .status { margin-top: 20px; padding: 12px 14px; border-radius: 10px; background: #25303c; border: 1px solid #435163; }
  .status[data-state="saved"] { border-color: #8bdc96; }
</style>
</head>
<body>
<main>
  <h1>You're invited to a Genesys game</h1>
  <p>Your GM is hosting dice for tonight's session. To join:</p>
  <ol>
    <li>Install the Genesys Overlay browser extension your GM shared with you.</li>
    <li>Reopen this link. The extension saves the invitation for you.</li>
    <li>Open your tabletop, open the dice tray, and choose <strong>Join game</strong>.</li>
  </ol>
  <p class="status" id="genesys-invite-status" data-state="waiting">
    The extension isn't installed in this browser yet, or it's turned off.
  </p>
</main>
</body>
</html>`;
}
