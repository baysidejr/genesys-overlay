// Chrome Native Messaging framing: each message is a 32-bit length in the
// computer's byte order (little-endian on Windows and every x86/ARM system
// Chrome runs on) followed by that many bytes of UTF-8 JSON.

import type { Readable, Writable } from "node:stream";

/** Chrome allows 1 MB from the host and 4 GB toward it; we accept far less. */
export const MAX_INCOMING_BYTES = 64 * 1024;

export function encodeFrame(message: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(message), "utf8");
  const frame = Buffer.alloc(4 + body.length);
  frame.writeUInt32LE(body.length, 0);
  body.copy(frame, 4);
  return frame;
}

/**
 * Reads framed messages from `input`. Calls onMessage for each, and onError
 * (then stops reading) if a frame is too large or isn't JSON.
 */
export function readFrames(
  input: Readable,
  onMessage: (message: unknown) => void,
  onError: (error: Error) => void,
): void {
  let buffer = Buffer.alloc(0);
  const onData = (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 4) {
      const length = buffer.readUInt32LE(0);
      if (length > MAX_INCOMING_BYTES) {
        input.off("data", onData);
        onError(new Error(`Message of ${length} bytes is over the ${MAX_INCOMING_BYTES}-byte limit`));
        return;
      }
      if (buffer.length < 4 + length) return;
      const body = buffer.subarray(4, 4 + length).toString("utf8");
      buffer = buffer.subarray(4 + length);
      let message: unknown;
      try {
        message = JSON.parse(body);
      } catch {
        input.off("data", onData);
        onError(new Error("Message isn't valid JSON"));
        return;
      }
      onMessage(message);
    }
  };
  input.on("data", onData);
}

export function writeFrame(output: Writable, message: unknown): void {
  output.write(encodeFrame(message));
}
