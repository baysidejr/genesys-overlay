// What the extension remembers.
//   Kept (extension local storage): your name, character and class; tray position per site.
//   Session only (cleared when the browser closes): the ticket that rejoins a
//   game after a reload, and an invitation saved from the GM's link.
// In the preview page, localStorage and sessionStorage stand in.

import { sanitizeCharacter, type Character } from "@genesys/shared";
import type { Identity, ResumeTicket } from "../multiplayer/client";
import type { ThemeChoice } from "../sheet/theme-menu";
import { isPosition, type TrayPosition } from "./drag";

const IDENTITY_KEY = "genesysOverlay.identity";
const TICKET_KEY = "genesysOverlay.ticket";
const INVITE_KEY = "genesysOverlay.pendingInvite";
const CHARACTERS_KEY = "genesysOverlay.characters";
/** Each tabletop site lays out its screen differently, so panels remember a spot per site. */
const positionKey = (panel: Panel) => `genesysOverlay.${panel}Position.${location.host}`;

export type Panel = "tray";

type Area = "local" | "session";

function extensionArea(area: Area): chrome.storage.StorageArea | null {
  try {
    return typeof chrome !== "undefined" && chrome.storage?.[area] ? chrome.storage[area] : null;
  } catch {
    return null;
  }
}

const webArea = (area: Area) => (area === "local" ? localStorage : sessionStorage);

async function read(area: Area, key: string): Promise<unknown> {
  try {
    const ext = extensionArea(area);
    if (ext) return (await ext.get(key))[key];
    const raw = webArea(area).getItem(key);
    return raw === null ? undefined : JSON.parse(raw);
  } catch {
    return undefined;
  }
}

async function write(area: Area, key: string, value: unknown): Promise<void> {
  try {
    const ext = extensionArea(area);
    if (value === undefined) {
      if (ext) await ext.remove(key);
      else webArea(area).removeItem(key);
    } else if (ext) {
      await ext.set({ [key]: value });
    } else {
      webArea(area).setItem(key, JSON.stringify(value));
    }
  } catch {
    // Storage blocked; this just won't be remembered.
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

export async function loadIdentity(): Promise<Identity> {
  const v = await read("local", IDENTITY_KEY);
  if (!isRecord(v)) return { playerName: "", characterName: "" };
  return {
    playerName: typeof v.playerName === "string" ? v.playerName : "",
    characterName: typeof v.characterName === "string" ? v.characterName : "",
    characterClass: typeof v.characterClass === "string" && v.characterClass ? v.characterClass : undefined,
  };
}

export function saveIdentity(identity: Identity): Promise<void> {
  return write("local", IDENTITY_KEY, identity);
}

export async function loadTicket(): Promise<ResumeTicket | null> {
  const v = await read("session", TICKET_KEY);
  return isRecord(v) && typeof v.invite === "string" && typeof v.token === "string" ? (v as unknown as ResumeTicket) : null;
}

export function saveTicket(ticket: ResumeTicket | null): Promise<void> {
  return write("session", TICKET_KEY, ticket ?? undefined);
}

export async function loadPendingInvite(): Promise<string | null> {
  const v = await read("session", INVITE_KEY);
  return typeof v === "string" ? v : null;
}

export function savePendingInvite(invite: string | null): Promise<void> {
  return write("session", INVITE_KEY, invite ?? undefined);
}

export async function loadPosition(panel: Panel): Promise<TrayPosition | null> {
  const saved = await read("local", positionKey(panel));
  return isPosition(saved) ? saved : null;
}

export function savePosition(panel: Panel, pos: TrayPosition): Promise<void> {
  return write("local", positionKey(panel), pos);
}

const SHEET_OPEN_KEY = "genesysOverlay.sheetOpen";
const SOUND_KEY = "genesysOverlay.sound";

/** Dice sounds are on unless the player turned them off. */
export async function loadSoundOn(): Promise<boolean> {
  return (await read("local", SOUND_KEY)) !== false;
}

export function saveSoundOn(on: boolean): Promise<void> {
  return write("local", SOUND_KEY, on);
}
const SHEET_THEME_KEY = "genesysOverlay.sheetTheme";

/** The player's sheet theme, or null to follow the computer's light or dark setting. */
export async function loadSheetTheme(): Promise<ThemeChoice> {
  const v = await read("local", SHEET_THEME_KEY);
  return v === "light" || v === "dark" || v === "genesys" || v === "terrinoth" || v === "keyforge" ? v : null;
}

export function saveSheetTheme(theme: ThemeChoice): Promise<void> {
  return write("local", SHEET_THEME_KEY, theme ?? undefined);
}

export async function loadSheetOpen(): Promise<boolean> {
  return (await read("local", SHEET_OPEN_KEY)) === true;
}

export function saveSheetOpen(open: boolean): Promise<void> {
  return write("local", SHEET_OPEN_KEY, open);
}

export interface CharacterLibrary {
  characters: Character[];
  /** The character on the sheet, if any. */
  activeId: string | null;
}

/** Characters live only in this browser. Each is re-checked on load in case storage was edited. */
export async function loadLibrary(): Promise<CharacterLibrary> {
  const v = await read("local", CHARACTERS_KEY);
  if (!isRecord(v) || !Array.isArray(v.characters)) return { characters: [], activeId: null };
  const characters = v.characters.map((c) => sanitizeCharacter(c)).filter((c): c is Character => c !== null);
  const activeId = typeof v.activeId === "string" && characters.some((c) => c.id === v.activeId) ? v.activeId : (characters[0]?.id ?? null);
  return { characters, activeId };
}

export function saveLibrary(library: CharacterLibrary): Promise<void> {
  return write("local", CHARACTERS_KEY, library);
}
