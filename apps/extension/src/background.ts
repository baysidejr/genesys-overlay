// Extension service worker. Content scripts can't use Native Messaging, so
// this relays the GM's Host game controls between the tabletop tab and the
// host companion (com.genesys_overlay.host).
//
// One native connection serves every tab and outlives tab reloads, so
// reloading the tabletop doesn't end the session. While it's open, Chrome
// keeps this worker alive. It's closed once the session has stopped.
//
// It also keeps the overlay registered on the sites the player turned on.

import type { HostBridgeMessage, HostBridgeRequest } from "./multiplayer/host-bridge";
import { optedInSites, SITES_SCRIPT_ID } from "./sites";

const NATIVE_HOST = "com.genesys_overlay.host";

// Lets content scripts keep the session-scoped resume ticket and invitations
// in storage.session, which is cleared when the browser closes.
void chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS" });

let native: chrome.runtime.Port | null = null;
let nextId = 1;
const tabs = new Set<chrome.runtime.Port>();
/** Native request id -> the tab port and the tab's own bridge id. */
const waiting = new Map<number, { port: chrome.runtime.Port; bridgeId: number }>();

function broadcast(message: HostBridgeMessage): void {
  for (const port of tabs) port.postMessage(message);
}

function connectNative(): chrome.runtime.Port {
  if (native) return native;
  const port = chrome.runtime.connectNative(NATIVE_HOST);
  native = port;
  port.onMessage.addListener((msg: { id?: number; ok?: boolean; result?: unknown; error?: string; event?: string; data?: unknown }) => {
    if (typeof msg.event === "string") {
      broadcast({ kind: "event", event: msg.event, data: msg.data });
      // Let the worker sleep once nothing is hosted.
      if (msg.event === "host.state" && (msg.data as { state?: string })?.state === "idle") scheduleDisconnect();
      return;
    }
    const target = typeof msg.id === "number" ? waiting.get(msg.id) : undefined;
    if (!target) return;
    waiting.delete(msg.id!);
    target.port.postMessage({ kind: "response", bridgeId: target.bridgeId, ok: msg.ok === true, result: msg.result, error: msg.error });
  });
  port.onDisconnect.addListener(() => {
    const reason = chrome.runtime.lastError?.message ?? "";
    native = null;
    // "Specified native messaging host not found" means the companion isn't installed.
    const error = /not found/i.test(reason) ? "not-installed" : reason || "The host companion stopped.";
    for (const [id, target] of waiting) {
      target.port.postMessage({ kind: "response", bridgeId: target.bridgeId, ok: false, error });
      waiting.delete(id);
    }
    broadcast({ kind: "event", event: "host.disconnected", data: error });
  });
  return port;
}

let disconnectTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleDisconnect(): void {
  if (disconnectTimer) clearTimeout(disconnectTimer);
  disconnectTimer = setTimeout(() => {
    disconnectTimer = null;
    if (native && waiting.size === 0) {
      native.disconnect();
      native = null;
    }
  }, 2000);
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "genesys-host" || port.sender?.id !== chrome.runtime.id) return;
  tabs.add(port);
  port.onDisconnect.addListener(() => tabs.delete(port));
  port.onMessage.addListener((req: HostBridgeRequest) => {
    if (disconnectTimer) clearTimeout(disconnectTimer);
    // host.status only asks a running companion; it never starts one.
    if (req.type === "host.status" && !native) {
      port.postMessage({ kind: "response", bridgeId: req.bridgeId, ok: true, result: null });
      return;
    }
    const id = nextId++;
    waiting.set(id, { port, bridgeId: req.bridgeId });
    const { bridgeId: _drop, ...command } = req;
    connectNative().postMessage({ ...command, id });
  });
});

// ---------- Opt-in sites ----------
// Alchemy RPG is in the manifest. Other sites run the overlay only after the
// player turns them on from the toolbar popup, which asks Chrome for that
// site's permission. One registered content script covers every site that
// has it, and is rebuilt whenever permissions change, including when the
// player removes a site in chrome://extensions.

async function syncSites(): Promise<void> {
  const { origins } = await chrome.permissions.getAll();
  const sites = optedInSites(origins);
  const registered = await chrome.scripting.getRegisteredContentScripts({ ids: [SITES_SCRIPT_ID] });
  if (registered.length) await chrome.scripting.unregisterContentScripts({ ids: [SITES_SCRIPT_ID] });
  if (!sites.length) return;
  await chrome.scripting.registerContentScripts([
    { id: SITES_SCRIPT_ID, matches: sites, js: ["content.js"], runAt: "document_idle", persistAcrossSessions: true },
  ]);
}

// One sync at a time, so quick changes can't race each other.
let syncing: Promise<void> = Promise.resolve();
const resync = () => {
  syncing = syncing.then(syncSites, syncSites).catch((e: unknown) => console.error("Couldn't update the overlay's sites", e));
};

chrome.runtime.onInstalled.addListener(resync);
chrome.runtime.onStartup.addListener(resync);

// A site was turned on: register it, and add the overlay to tabs already
// open there, so the player doesn't have to reload.
chrome.permissions.onAdded.addListener(async ({ origins }) => {
  resync();
  const sites = optedInSites(origins);
  if (!sites.length) return;
  for (const tab of await chrome.tabs.query({ url: sites })) {
    if (tab.id === undefined) continue;
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] }).catch(() => undefined);
  }
});

// A site was turned off: unregister it, and ask open tabs on it to remove
// the overlay. The permission is already gone, so every tab hears and only
// tabs on that site act.
chrome.permissions.onRemoved.addListener(async ({ origins }) => {
  resync();
  const sites = optedInSites(origins);
  if (!sites.length) return;
  for (const tab of await chrome.tabs.query({})) {
    if (tab.id === undefined) continue;
    chrome.tabs.sendMessage(tab.id, { type: "sites.removed", sites }).catch(() => undefined);
  }
});
