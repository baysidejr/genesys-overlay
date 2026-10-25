// The sheet's theme picker: an icon button that opens a small menu.
// "Match my computer" follows the system light/dark setting.

import { h, svg } from "../ui/dom";

export type SheetTheme = "dark" | "light" | "genesys" | "terrinoth" | "keyforge";
/** null means follow the computer's light or dark setting. */
export type ThemeChoice = SheetTheme | null;

const OPTIONS: { value: ThemeChoice; label: string; hint: string }[] = [
  { value: null, label: "Match my computer", hint: "Light or dark, like your system" },
  { value: "dark", label: "Dark", hint: "Slate felt, easy on the eyes" },
  { value: "light", label: "Light", hint: "Clean paper" },
  { value: "genesys", label: "Genesys", hint: "Like the printed character sheet" },
  { value: "terrinoth", label: "Terrinoth", hint: "Like the Realms of Terrinoth sheet" },
  { value: "keyforge", label: "KeyForge", hint: "Like the Secrets of the Crucible sheet" },
];

const paletteIcon = () =>
  svg(
    `<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M10 2.2a7.8 7.8 0 1 0 0 15.6c1.2 0 1.7-.8 1.4-1.8-.4-1.1.3-2.1 1.5-2.1h1.6a3.3 3.3 0 0 0 3.3-3.3C17.8 5.6 14.3 2.2 10 2.2z"/><circle cx="6.3" cy="9" r="1.1" fill="currentColor" stroke="none"/><circle cx="8.8" cy="5.9" r="1.1" fill="currentColor" stroke="none"/><circle cx="12.6" cy="6.3" r="1.1" fill="currentColor" stroke="none"/></svg>`,
  );

export class ThemeMenu {
  readonly el: HTMLElement;
  private readonly button: HTMLButtonElement;
  private readonly menu: HTMLElement;
  private choice: ThemeChoice = null;

  constructor(private readonly onPick: (choice: ThemeChoice) => void) {
    this.button = h(
      "button",
      {
        class: "icon-button theme-button",
        "aria-haspopup": "menu",
        "aria-expanded": "false",
        "aria-label": "Sheet theme",
        title: "Sheet theme",
        onclick: () => this.setOpen(this.menu.hidden),
      },
      paletteIcon(),
    );
    this.menu = h("div", { class: "theme-menu", role: "menu", "aria-label": "Sheet theme", hidden: true });
    this.el = h(
      "div",
      {
        class: "theme-picker",
        onkeydown: (e: KeyboardEvent) => this.onKey(e),
        onfocusout: (e: FocusEvent) => {
          if (!this.el.contains(e.relatedTarget as Node | null)) this.setOpen(false);
        },
      },
      this.button,
      this.menu,
    );
    this.render();
  }

  set(choice: ThemeChoice): void {
    this.choice = choice;
    this.render();
  }

  private render(): void {
    this.menu.replaceChildren(
      ...OPTIONS.map((o) =>
        h(
          "button",
          {
            class: "theme-option",
            role: "menuitemradio",
            "aria-checked": String(o.value === this.choice),
            tabIndex: -1,
            dataset: { value: o.value ?? "system" },
            onclick: () => {
              this.choice = o.value;
              this.render();
              this.setOpen(false);
              this.button.focus();
              this.onPick(o.value);
            },
          },
          h("span", { class: "theme-swatch", dataset: { theme: o.value ?? "system" }, "aria-hidden": "true" }),
          h("span", { class: "theme-text" }, h("span", {}, o.label), h("span", { class: "muted" }, o.hint)),
        ),
      ),
    );
  }

  private setOpen(open: boolean): void {
    this.menu.hidden = !open;
    this.button.setAttribute("aria-expanded", String(open));
    if (open) this.items()[Math.max(0, OPTIONS.findIndex((o) => o.value === this.choice))]?.focus();
  }

  private items(): HTMLButtonElement[] {
    return [...this.menu.querySelectorAll<HTMLButtonElement>(".theme-option")];
  }

  private onKey(e: KeyboardEvent): void {
    if (this.menu.hidden) return;
    const items = this.items();
    const i = items.indexOf(e.target as HTMLButtonElement);
    if (e.key === "Escape") {
      // Close just the menu, not the whole sheet.
      e.stopPropagation();
      this.setOpen(false);
      this.button.focus();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      items[(i + step + items.length) % items.length]?.focus();
    }
  }
}
