// Which sites the overlay runs on. Alchemy RPG is built in (listed in the
// manifest's content_scripts). Any other site is opt-in: the player turns it
// on from the toolbar popup, Chrome grants that one site's permission, and
// the background worker registers the overlay there.

/** Sites the manifest covers on its own; never listed as opted-in. */
export const BUILT_IN_SITES: readonly string[] = ["https://app.alchemyrpg.com/*"];

/** Match patterns the manifest uses for other jobs (saving invitations). */
const MANIFEST_PATTERNS: readonly string[] = [...BUILT_IN_SITES, "https://*.trycloudflare.com/join*"];

/** Id of the dynamic content script that covers every opted-in site. */
export const SITES_SCRIPT_ID = "genesys-opt-in-sites";

/**
 * The match pattern for a page's site, like "https://app.roll20.net/*", or
 * null where the overlay can't run: anything that isn't an https web page
 * (chrome://, the Web Store, local files, plain http).
 */
export function sitePattern(url: string | undefined): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || !parsed.hostname) return null;
  // Chrome doesn't let extensions run on its own store.
  if (parsed.hostname === "chromewebstore.google.com" || parsed.hostname === "chrome.google.com") return null;
  return `https://${parsed.hostname}/*`;
}

/** The host a pattern names, for showing to the player: "app.roll20.net". */
export function siteHost(pattern: string): string {
  return pattern.replace(/^https:\/\//, "").replace(/\/\*$/, "");
}

export function isBuiltIn(pattern: string): boolean {
  return BUILT_IN_SITES.includes(pattern);
}

/** Opted-in sites among the origins Chrome has granted, sorted by host. */
export function optedInSites(grantedOrigins: readonly string[] | undefined): string[] {
  return [...new Set(grantedOrigins ?? [])]
    .filter((o) => !MANIFEST_PATTERNS.includes(o) && /^https:\/\/[^/*]+\/\*$/.test(o))
    .sort((a, b) => siteHost(a).localeCompare(siteHost(b)));
}
