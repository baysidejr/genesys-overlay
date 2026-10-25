// Secrets, room codes and rate limiting for the session.

import { randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { ROOM_CODE_ALPHABET } from "@genesys/shared";

/** URL-safe random token. 24 bytes gives 192 bits, far beyond guessing. */
export function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString("base64url");
}

export function randomRoomCode(length = 6): string {
  return Array.from({ length }, () => ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)]).join("");
}

/** Compares secrets without leaking how much of them matched through timing. */
export function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Token bucket: `capacity` actions at once, refilling at `perSecond`. */
export class RateLimiter {
  private tokens: number;
  private last: number;

  constructor(
    private readonly capacity: number,
    private readonly perSecond: number,
    private readonly now: () => number = Date.now,
  ) {
    this.tokens = capacity;
    this.last = now();
  }

  take(): boolean {
    const t = this.now();
    this.tokens = Math.min(this.capacity, this.tokens + ((t - this.last) / 1000) * this.perSecond);
    this.last = t;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}
