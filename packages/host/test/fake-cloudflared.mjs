// Stands in for cloudflared in tests. FAKE_MODE picks the behaviour:
//   ok      print a tunnel address like the real banner, then stay running
//   crash   print an error and exit before any address
//   silent  never print an address
//   die     print an address, then exit a moment later (tunnel drops)
const mode = process.env.FAKE_MODE ?? "ok";
const log = (line) => process.stderr.write(`2026-10-24T21:00:00Z INF ${line}\n`);

log("Requesting new quick Tunnel on trycloudflare.com...");
if (mode === "crash") {
  log("ERR failed to request quick Tunnel: 429 Too Many Requests");
  process.exit(1);
}
if (mode !== "silent") {
  log("+--------------------------------------------------------------------------------------------+");
  log("|  Your quick Tunnel has been created! Visit it at (it may take some time to be reachable):  |");
  log("|  https://brave-otter-lamp-test.trycloudflare.com                                            |");
  log("+--------------------------------------------------------------------------------------------+");
  log("Registered tunnel connection connIndex=0 event=0 location=atl12 protocol=quic");
}
if (mode === "die") setTimeout(() => process.exit(3), 300);
setInterval(() => {}, 1000);
