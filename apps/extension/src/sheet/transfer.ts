// Moving characters between browsers without a server: as a file, or as a
// share code (compressed text that fits in a Discord message). Anything
// imported goes through sanitizeCharacter, because it came from someone else.

import { sanitizeCharacter, type Character } from "@genesys/shared";

const FORMAT = "genesys-overlay.character";
const CODE_PREFIX = "GO1:";
/** Generous for one character; stops someone pasting a huge blob. */
const MAX_IMPORT_CHARS = 200_000;

interface ExportFile {
  format: typeof FORMAT;
  version: 1;
  exportedAt: string;
  character: Character;
}

export function exportJson(character: Character): string {
  const file: ExportFile = { format: FORMAT, version: 1, exportedAt: new Date().toISOString(), character };
  return JSON.stringify(file, null, 2);
}

export function exportFileName(character: Character): string {
  const slug = character.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "character";
  return `${slug}.genesys.json`;
}

export async function shareCode(character: Character): Promise<string> {
  const bytes = await pipe(new TextEncoder().encode(JSON.stringify({ format: FORMAT, version: 1, character })), new CompressionStream("deflate-raw"));
  return CODE_PREFIX + toBase64Url(bytes);
}

/**
 * Reads a share code, an exported file's text, or a bare character as JSON.
 * Returns null with no exceptions if it isn't any of those.
 */
export async function parseImport(input: string): Promise<Character | null> {
  const textIn = input.trim();
  if (!textIn || textIn.length > MAX_IMPORT_CHARS) return null;
  let json: string;
  if (textIn.startsWith(CODE_PREFIX)) {
    try {
      const bytes = await pipe(fromBase64Url(textIn.slice(CODE_PREFIX.length)), new DecompressionStream("deflate-raw"));
      if (bytes.length > MAX_IMPORT_CHARS * 4) return null;
      json = new TextDecoder().decode(bytes);
    } catch {
      return null;
    }
  } else {
    json = textIn;
  }
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return null;
  }
  const record = data as Partial<ExportFile> | null;
  const raw = record && typeof record === "object" && record.format === FORMAT ? record.character : data;
  return sanitizeCharacter(raw);
}

async function pipe(input: Uint8Array<ArrayBuffer>, transform: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const stream = new Blob([input]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const bin = atob(text.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
