// Dice sounds. The sound is bundled into the extension and played through
// Web Audio, so a site's rules for media can't block it and nothing is
// fetched from the network.
//
// Browsers only allow sound after the player has clicked or typed on the
// page. A roll from someone else that arrives before that plays silently.

import standardRoll from "../assets/sounds/standard-dice-roll.mp3?inline";

const VOLUME = 0.7;

export class DiceSounds {
  private context: AudioContext | null = null;
  private buffer: Promise<AudioBuffer> | null = null;
  enabled = true;

  /** Plays the roll sound, unless sound is off or the browser won't allow it yet. */
  async roll(): Promise<void> {
    if (!this.enabled) return;
    try {
      const context = (this.context ??= new AudioContext());
      // Without a click on the page, resume() waits until one happens; a late
      // rattle would be worse than none, so give up after a moment.
      if (context.state === "suspended") await Promise.race([context.resume(), new Promise((r) => setTimeout(r, 150))]);
      if (context.state !== "running") return;
      const source = context.createBufferSource();
      source.buffer = await (this.buffer ??= context.decodeAudioData(dataUrlBytes(standardRoll)));
      const gain = context.createGain();
      gain.gain.value = VOLUME;
      source.connect(gain).connect(context.destination);
      source.start();
    } catch {
      // No sound is better than a broken roll.
    }
  }
}

function dataUrlBytes(url: string): ArrayBuffer {
  const binary = atob(url.slice(url.indexOf(",") + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
