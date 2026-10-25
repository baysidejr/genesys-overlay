// Small editable fields shared by every sheet page. Each one writes through a
// setter and calls `edited` so the sheet can save. Values are only ever set
// as text or input values, never as HTML.

import type { DicePool } from "@genesys/shared";
import { h, svg } from "../ui/dom";
import { gem } from "../ui/gems";

export type Edited = () => void;

export const closeIcon = () =>
  svg(`<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`);

export function labelled(label: string, input: HTMLElement, hint?: string): HTMLElement {
  return h("label", { class: "field-label" }, h("span", {}, label, hint && h("span", { class: "muted" }, ` ${hint}`)), input);
}

export function textInput(
  value: string,
  max: number,
  label: string,
  set: (v: string) => void,
  edited: Edited,
  placeholder?: string,
): HTMLInputElement {
  return h("input", {
    class: "field sheet-field",
    type: "text",
    value,
    maxLength: max,
    placeholder,
    "aria-label": label,
    oninput: (e: Event) => {
      set((e.target as HTMLInputElement).value.trim());
      edited();
    },
  });
}

/** A text box that grows with what's written in it. */
export function textArea(value: string, max: number, label: string, set: (v: string) => void, edited: Edited, rows = 2): HTMLTextAreaElement {
  const area: HTMLTextAreaElement = h("textarea", {
    class: "field sheet-field sheet-area",
    value,
    rows,
    maxLength: max,
    "aria-label": label,
    oninput: () => {
      set(area.value);
      edited();
      fit();
    },
  });
  const fit = () => {
    area.style.height = "auto";
    area.style.height = `${area.scrollHeight + 2}px`;
  };
  // Size to the content once it's on the page.
  requestAnimationFrame(fit);
  return area;
}

function clampInt(raw: string, min: number, max: number): number | null {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null;
}

export function numberInput(value: number, min: number, max: number, label: string, set: (v: number) => void, edited: Edited): HTMLInputElement {
  const input: HTMLInputElement = h("input", {
    class: "field number-field",
    type: "number",
    inputMode: "numeric",
    value: String(value),
    min: String(min),
    max: String(max),
    "aria-label": label,
    oninput: () => {
      const v = clampInt(input.value, min, max);
      if (v === null) return;
      set(v);
      edited();
    },
    // Show the clamped value once the player is done typing.
    onchange: () => {
      const v = clampInt(input.value, min, max) ?? min;
      input.value = String(v);
      set(v);
      edited();
    },
  });
  return input;
}

/** A number with − and + buttons, for wounds and strain that change mid-fight. */
export function stepper(value: number, min: number, max: number, label: string, set: (v: number) => void, edited: Edited): HTMLElement {
  const input = numberInput(value, min, max, label, set, edited);
  const bump = (d: number) => {
    const v = Math.min(max, Math.max(min, (clampInt(input.value, min, max) ?? min) + d));
    input.value = String(v);
    set(v);
    edited();
  };
  return h(
    "span",
    { class: "stepper" },
    h("button", { class: "step", "aria-label": `Less ${label.toLowerCase()}`, onclick: (e: Event) => (e.preventDefault(), bump(-1)) }, "−"),
    input,
    h("button", { class: "step", "aria-label": `More ${label.toLowerCase()}`, onclick: (e: Event) => (e.preventDefault(), bump(1)) }, "+"),
  );
}

export function select<T extends string>(value: T, options: readonly T[], label: string, set: (v: T) => void, edited: Edited): HTMLSelectElement {
  return h(
    "select",
    {
      class: "field",
      "aria-label": label,
      onchange: (e: Event) => {
        set((e.target as HTMLSelectElement).value as T);
        edited();
      },
    },
    ...options.map((o) => h("option", { value: o, selected: o === value }, o)),
  );
}

export function checkbox(checked: boolean, label: string, set: (v: boolean) => void, edited: Edited): HTMLInputElement {
  return h("input", {
    type: "checkbox",
    class: "career-box",
    checked,
    "aria-label": label,
    onchange: (e: Event) => {
      set((e.target as HTMLInputElement).checked);
      edited();
    },
  });
}

export function poolGems(pool: DicePool, size = 14): Node[] {
  const out: Node[] = [];
  for (const type of ["proficiency", "ability", "challenge", "difficulty"] as const) {
    for (let i = 0; i < (pool[type] ?? 0); i++) out.push(gem(type, size));
  }
  return out;
}

export function removeButton(label: string, onclick: () => void): HTMLButtonElement {
  return h("button", { class: "icon-button", "aria-label": label, onclick }, closeIcon());
}
