import { describe, expect, it } from "vitest";
import { isBuiltIn, optedInSites, sitePattern, siteHost } from "./sites";

describe("sitePattern", () => {
  it("covers the whole site of an https page", () => {
    expect(sitePattern("https://app.roll20.net/editor/?campaign=1#x")).toBe("https://app.roll20.net/*");
    expect(sitePattern("https://foundry.example.com:30000/game")).toBe("https://foundry.example.com/*");
  });

  it("refuses pages the overlay can't run on", () => {
    expect(sitePattern("http://localhost:30000/game")).toBeNull();
    expect(sitePattern("chrome://extensions")).toBeNull();
    expect(sitePattern("file:///C:/notes.html")).toBeNull();
    expect(sitePattern("https://chromewebstore.google.com/detail/x")).toBeNull();
    expect(sitePattern("not a url")).toBeNull();
    expect(sitePattern(undefined)).toBeNull();
  });
});

describe("optedInSites", () => {
  it("leaves out the manifest's own patterns and anything that isn't one whole https site", () => {
    expect(
      optedInSites([
        "https://app.alchemyrpg.com/*",
        "https://*.trycloudflare.com/join*",
        "https://www.owlbear.rodeo/*",
        "https://app.roll20.net/*",
        "https://*/*",
        "http://example.com/*",
        "https://app.roll20.net/*",
      ]),
    ).toEqual(["https://www.owlbear.rodeo/*", "https://app.roll20.net/*"].sort((a, b) => siteHost(a).localeCompare(siteHost(b))));
  });

  it("knows Alchemy is built in", () => {
    expect(isBuiltIn("https://app.alchemyrpg.com/*")).toBe(true);
    expect(isBuiltIn("https://app.roll20.net/*")).toBe(false);
    expect(optedInSites(undefined)).toEqual([]);
  });
});
