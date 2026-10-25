import WebSocket from "ws";
import { PROTOCOL_VERSION, type HostEnvelope } from "@genesys/shared";

/** A test client that records everything the host sends. */
export class TestClient {
  readonly ws: WebSocket;
  readonly received: HostEnvelope[] = [];
  closeCode: number | null = null;
  private waiters: { match: (m: HostEnvelope) => boolean; resolve: (m: HostEnvelope) => void }[] = [];

  private constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ws.on("message", (data) => {
      const msg = JSON.parse(data.toString()) as HostEnvelope;
      this.received.push(msg);
      this.waiters = this.waiters.filter((w) => {
        if (!w.match(msg)) return true;
        w.resolve(msg);
        return false;
      });
    });
    this.ws.on("close", (code) => (this.closeCode = code));
  }

  /** Connects to a local port, or to a full ws:// or wss:// address. */
  static async connect(target: number | string): Promise<TestClient> {
    const client = new TestClient(typeof target === "number" ? `ws://127.0.0.1:${target}/ws` : target);
    await new Promise<void>((resolve, reject) => {
      client.ws.once("open", () => resolve());
      client.ws.once("error", reject);
    });
    return client;
  }

  send(body: object): void {
    this.ws.send(JSON.stringify({ version: PROTOCOL_VERSION, ...body }));
  }

  /** How many messages of each type next() has handed out. */
  private readonly consumed = new Map<string, number>();

  /**
   * Resolves with the next message of `type` not yet returned by next(),
   * whether it already arrived or arrives within the timeout.
   */
  next<T extends HostEnvelope["type"]>(type: T, timeoutMs = 2000): Promise<Extract<HostEnvelope, { type: T }>> {
    const index = this.consumed.get(type) ?? 0;
    this.consumed.set(type, index + 1);
    const already = this.of(type)[index];
    if (already) return Promise.resolve(already);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`No ${type} within ${timeoutMs}ms`)), timeoutMs);
      this.waiters.push({
        match: (m) => m.type === type && this.of(type).length > index,
        resolve: () => {
          clearTimeout(timer);
          resolve(this.of(type)[index]!);
        },
      });
    });
  }

  of<T extends HostEnvelope["type"]>(type: T): Extract<HostEnvelope, { type: T }>[] {
    return this.received.filter((m) => m.type === type) as Extract<HostEnvelope, { type: T }>[];
  }

  closed(timeoutMs = 2000): Promise<number> {
    if (this.closeCode !== null) return Promise.resolve(this.closeCode);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Socket stayed open")), timeoutMs);
      this.ws.once("close", (code) => {
        clearTimeout(timer);
        resolve(code);
      });
    });
  }
}

export const settle = (ms = 50) => new Promise((r) => setTimeout(r, ms));

export const sampleRoll = (clientEventId: string) => ({
  type: "dice.roll",
  clientEventId,
  label: "Athletics",
  dicePool: { ability: 2, proficiency: 1, difficulty: 1 },
  dice: [
    { type: "ability", face: 3 },
    { type: "ability", face: 6 },
    { type: "difficulty", face: 3 },
    { type: "proficiency", face: 11 },
  ],
});
