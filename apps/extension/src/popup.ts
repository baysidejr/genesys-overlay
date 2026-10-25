// The toolbar popup: turns the overlay on or off for the site in the current
// tab, and lists the sites the player has turned on.
//
// Turning a site on only asks Chrome for that site's permission. The
// background worker does the rest when the permission arrives (registers the
// overlay there and adds it to open tabs), because on some systems Chrome
// closes this popup while its permission prompt is showing.

import { isBuiltIn, optedInSites, sitePattern, siteHost } from "./sites";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const siteEl = $("site");
const statusEl = $("status");
const toggle = $<HTMLButtonElement>("toggle");
const list = $<HTMLUListElement>("sites");
const noSites = $("no-sites");

let pattern: string | null = null;

async function render(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  pattern = sitePattern(tab?.url);
  const { origins } = await chrome.permissions.getAll();
  const sites = optedInSites(origins);

  toggle.hidden = true;
  if (!pattern) {
    siteEl.textContent = "This page";
    statusEl.textContent = "The overlay can only run on secure (https) web pages.";
    statusEl.dataset.on = "false";
  } else if (isBuiltIn(pattern)) {
    siteEl.textContent = siteHost(pattern);
    statusEl.textContent = "Always on here.";
    statusEl.dataset.on = "true";
  } else {
    const on = sites.includes(pattern);
    siteEl.textContent = siteHost(pattern);
    statusEl.textContent = on ? "On for this site." : "Off. Turn it on to use your dice and sheet here.";
    statusEl.dataset.on = String(on);
    toggle.textContent = on ? "Turn off for this site" : "Turn on for this site";
    toggle.classList.toggle("secondary", on);
    toggle.hidden = false;
  }

  list.replaceChildren(
    ...sites.map((site) => {
      const remove = document.createElement("button");
      remove.textContent = "Turn off";
      remove.setAttribute("aria-label", `Turn off for ${siteHost(site)}`);
      remove.addEventListener("click", () => void turnOff(site));
      const item = document.createElement("li");
      item.append(siteHost(site), remove);
      return item;
    }),
  );
  noSites.hidden = sites.length > 0;
}

async function turnOff(site: string): Promise<void> {
  await chrome.permissions.remove({ origins: [site] });
  await render();
}

toggle.addEventListener("click", () => {
  if (!pattern) return;
  if (toggle.classList.contains("secondary")) {
    void turnOff(pattern);
    return;
  }
  // Must be called straight from the click, before anything is awaited.
  void chrome.permissions.request({ origins: [pattern] }).then((granted) => {
    if (!granted) statusEl.textContent = "Chrome didn't allow it, so the overlay stays off here.";
    return render();
  });
});

void render();
