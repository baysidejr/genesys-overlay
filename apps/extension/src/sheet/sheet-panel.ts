// The character sheet, with the pages of the official Genesys sheet plus spells:
//   Play     header, characteristics, soak/wounds/strain/defense, XP, skills, weapons
//   Story    motivations, description, equipment, heroic ability, injuries, talents, notes (story-page.ts)
//   Talents  the talent pyramid (talents-page.ts)
//   Spells   spells the character usually casts (spells-page.ts)
//   Vehicle  the character's vehicle, in settings that have one (vehicle-page.ts)
// Which skills, currency and blocks appear comes from the character's setting.
// Every field edits in place and saves as you type. Clicking a skill, weapon
// or spell's dice puts its pool in the dice tray, ready to roll.
//
// Text from imported characters is only ever set as text or input values,
// never as HTML.

import {
  CHARACTERISTICS,
  createCharacter,
  SETTINGS,
  settingById,
  settingHas,
  skillPool,
  WEAPON_RANGES,
  type Character,
  type Characteristic,
  type CustomSkill,
  type DicePool,
  type SkillDefinition,
  type Weapon,
} from "@genesys/shared";
import { h } from "../ui/dom";
import type { CharacterLibrary } from "../ui/storage";
import { checkbox, closeIcon, labelled, numberInput, poolGems, removeButton, stepper, textArea, textInput } from "./fields";
import { spellsPage } from "./spells-page";
import { storyPage } from "./story-page";
import { talentsPage } from "./talents-page";
import { vehiclePage } from "./vehicle-page";
import { ThemeMenu, type SheetTheme, type ThemeChoice } from "./theme-menu";
import { exportFileName, exportJson, parseImport, shareCode } from "./transfer";

const PAGES = ["Play", "Story", "Talents", "Spells", "Vehicle"] as const;
type Page = (typeof PAGES)[number];

/** The pages this character's setting has: Vehicle only where the setting has vehicles. */
const pagesFor = (c: Character | null): Page[] =>
  PAGES.filter((p) => p !== "Vehicle" || (c !== null && settingHas(settingById(c.settingId), "vehicle")));

const CHAR_NAMES: Record<Characteristic, string> = {
  brawn: "Brawn",
  agility: "Agility",
  intellect: "Intellect",
  cunning: "Cunning",
  willpower: "Willpower",
  presence: "Presence",
};

const CHAR_SHORT: Record<Characteristic, string> = {
  brawn: "Br",
  agility: "Ag",
  intellect: "Int",
  cunning: "Cun",
  willpower: "Will",
  presence: "Pr",
};

export interface SheetActions {
  /** Puts a pool in the dice tray with a label. */
  roll(pool: DicePool, label: string): void;
  /** The library changed; save it. */
  persist(library: CharacterLibrary): void;
  /** The character on the sheet changed (switched, renamed or retitled). */
  activeChanged(character: Character | null): void;
  /** Opened or closed by the player; remember it. */
  onVisibilityChange(visible: boolean): void;
  /** The player picked a theme (null: match the computer); remember it. */
  onThemeChange(theme: ThemeChoice): void;
  /** The theme the sheet now shows, with "match my computer" resolved; the tray wears it too. */
  themeApplied(theme: SheetTheme): void;
}

export class SheetPanel {
  readonly el: HTMLElement;
  private readonly body: HTMLElement;
  private library: CharacterLibrary = { characters: [], activeId: null };
  private visible = false;
  private page: Page = "Play";
  private readonly tabs: HTMLElement;
  private readonly themeMenu: ThemeMenu;
  private readonly systemDark = matchMedia("(prefers-color-scheme: dark)");
  /** The player's pick, or null to follow the computer's setting. */
  private chosenTheme: ThemeChoice = null;
  /** Passed to every field: an edit happened, so save soon. */
  private readonly edit = () => this.changed();
  /** Refreshes every dice preview after a characteristic or rank changes. */
  private refreshers: (() => void)[] = [];

  constructor(private readonly actions: SheetActions) {
    this.tabs = h("div", { class: "sheet-tabs", role: "tablist", "aria-label": "Sheet pages" });
    this.themeMenu = new ThemeMenu((choice) => {
      this.chosenTheme = choice;
      this.applyTheme();
      this.actions.onThemeChange(choice);
    });
    const head = h(
      "header",
      { class: "sheet-head" },
      h("h2", { class: "title" }, "Character"),
      this.tabs,
      this.themeMenu.el,
      h("button", { class: "icon-button sheet-close", "aria-label": "Close character sheet", title: "Close (Esc)", onclick: () => this.setVisible(false) }, closeIcon()),
    );
    this.body = h("div", { class: "sheet-scroll", role: "tabpanel" });
    this.el = h(
      "div",
      {
        class: "sheet",
        hidden: true,
        onkeydown: (e: KeyboardEvent) => {
          if (e.key === "Escape") this.setVisible(false);
        },
      },
      h("section", { class: "panel sheet-panel", role: "dialog", "aria-label": "Character sheet" }, head, this.body),
    );
    // Until the player picks, the page follows the computer's light or dark setting.
    this.systemDark.addEventListener("change", () => this.applyTheme());
    this.applyTheme();
  }

  /** Restores a saved choice; null means follow the computer's setting. */
  setTheme(theme: ThemeChoice): void {
    this.chosenTheme = theme;
    this.themeMenu.set(theme);
    this.applyTheme();
  }

  /** The theme on show, with "match my computer" resolved to light or dark. */
  get theme(): SheetTheme {
    return this.chosenTheme ?? (this.systemDark.matches ? "dark" : "light");
  }

  private applyTheme(): void {
    this.el.dataset.theme = this.theme;
    this.actions.themeApplied(this.theme);
  }

  get active(): Character | null {
    return this.library.characters.find((c) => c.id === this.library.activeId) ?? null;
  }

  setLibrary(library: CharacterLibrary): void {
    this.library = library;
    this.render();
  }

  toggle(): void {
    this.setVisible(!this.visible);
  }

  /**
   * Leaves room for the open dice tray beside the sheet, so both are usable
   * at once. On windows too narrow for both, the tray simply sits on top.
   */
  makeRoomFor(cover: { left: number; right: number }): void {
    const roomy = innerWidth - cover.left - cover.right >= 640;
    this.el.style.paddingLeft = roomy && cover.left ? `${cover.left}px` : "";
    this.el.style.paddingRight = roomy && cover.right ? `${cover.right}px` : "";
  }

  get isVisible(): boolean {
    return this.visible;
  }

  /** Restores the saved open/closed state without reporting it back. */
  show(visible: boolean): void {
    this.visible = visible;
    this.el.hidden = !visible;
    if (visible) this.el.querySelector<HTMLElement>('.sheet-tab[aria-selected="true"], .sheet-close')?.focus();
  }

  private setVisible(visible: boolean): void {
    this.show(visible);
    this.actions.onVisibilityChange(visible);
  }

  // ---------- Rendering ----------

  private render(): void {
    this.refreshers = [];
    const c = this.active;
    // Switching to a setting without this page goes back to the first.
    if (!pagesFor(c).includes(this.page)) this.page = "Play";
    this.renderTabs(c);
    const redraw = () => this.render();
    const content = !c
      ? this.empty()
      : this.page === "Story"
        ? storyPage(c, settingById(c.settingId), this.edit, redraw)
        : this.page === "Talents"
          ? talentsPage(c, this.edit, redraw)
          : this.page === "Spells"
            ? spellsPage(c, settingById(c.settingId), this.edit, redraw, (pool, label) => this.actions.roll(pool, label))
            : this.page === "Vehicle"
              ? vehiclePage(c, settingById(c.settingId), this.edit, redraw, (pool, label) => this.actions.roll(pool, label))
              : this.sheet(c);
    const scroll = this.body.scrollTop;
    const page = h("div", { class: `sheet-page page-${c ? this.page.toLowerCase() : "empty"}` }, ...content);
    this.body.replaceChildren(page, this.manage(c));
    // Adding or removing a row redraws the page; stay where the player was.
    this.body.scrollTop = scroll;
    this.actions.activeChanged(c);
  }

  private renderTabs(c: Character | null): void {
    const pages = pagesFor(c);
    this.tabs.hidden = !c;
    this.tabs.replaceChildren(
      ...pages.map((page) =>
        h(
          "button",
          {
            class: "sheet-tab",
            role: "tab",
            "aria-selected": String(page === this.page),
            tabIndex: page === this.page ? 0 : -1,
            onclick: () => this.showPage(page),
            onkeydown: (e: KeyboardEvent) => {
              const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
              if (!step) return;
              e.preventDefault();
              this.showPage(pages[(pages.indexOf(page) + step + pages.length) % pages.length]!);
              this.tabs.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
            },
          },
          page,
        ),
      ),
    );
  }

  private showPage(page: Page): void {
    if (page === this.page) return;
    this.page = page;
    this.body.scrollTop = 0;
    this.render();
  }

  /** Saves after an edit. Debounced so typing doesn't write on every key. */
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private changed(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.actions.persist(this.library), 300);
  }

  private empty(): Node[] {
    return [
      h(
        "div",
        { class: "sheet-empty" },
        h("p", {}, "No character yet. Make one, or import one a friend or your past self exported."),
        h("button", { class: "secondary", onclick: () => this.create() }, "Create a character"),
      ),
    ];
  }

  /** Each section has a sec-* class so themes can lay the page out their own way. */
  private sheet(c: Character): Node[] {
    const effects = settingHas(settingById(c.settingId), "effects") ? [this.effects(c)] : [];
    return [this.header(c), this.characteristics(c), this.derived(c), this.xp(c), this.skills(c), ...effects, this.weapons(c)];
  }

  /** KeyForge's Æffects box: each Æffect with its type and power. */
  private effects(c: Character): HTMLElement {
    const list = h("div", { class: "effects" });
    const draw = () => {
      list.replaceChildren(
        ...(c.effects.length
          ? c.effects.map((e, i) =>
              h(
                "div",
                { class: "effect" },
                h(
                  "div",
                  { class: "effect-top" },
                  labelled("Æffect", textInput(e.name, 80, "Æffect", (v) => (e.name = v), this.edit)),
                  labelled("Type", textInput(e.type, 40, "Type", (v) => (e.type = v), this.edit)),
                  removeButton(`Remove ${e.name || "this Æffect"}`, () => {
                    c.effects.splice(i, 1);
                    this.changed();
                    draw();
                  }),
                ),
                labelled("Power", textArea(e.power, 2000, "Power", (v) => (e.power = v), this.edit, 2)),
              ),
            )
          : [h("p", { class: "muted" }, "No Æffects yet.")]),
        ...(c.effects.length < 8
          ? [
              h(
                "button",
                {
                  class: "text-button effect-add",
                  onclick: () => {
                    c.effects.push({ name: "", type: "", power: "" });
                    this.changed();
                    draw();
                  },
                },
                "+ Æffect",
              ),
            ]
          : []),
      );
    };
    draw();
    return h("div", { class: "sheet-section sec-effects" }, h("h3", { class: "sheet-heading sheet-banner" }, "Æffects"), list);
  }

  private header(c: Character): HTMLElement {
    const name = textInput(c.name, 80, "Character name", (v) => {
      c.name = v || "Unnamed character";
      this.actions.activeChanged(c);
    }, this.edit);
    name.classList.add("sheet-name");
    return h(
      "div",
      { class: "sheet-section sheet-header sec-header" },
      // Shown only where the theme calls for them, as on the printed sheet.
      h("span", { class: "sheet-kicker" }, "Character"),
      h("label", { class: "name-row" }, h("span", { class: "name-label" }, "Character name"), name),
      h(
        "div",
        { class: "sheet-meta" },
        labelled("Species/Archetype", textInput(c.species, 40, "Species or archetype", (v) => (c.species = v), this.edit)),
        labelled("Career", textInput(c.career, 40, "Career", (v) => {
          c.career = v;
          this.actions.activeChanged(c);
        }, this.edit)),
        labelled("Player", textInput(c.player, 40, "Player", (v) => {
          c.player = v;
          this.actions.activeChanged(c);
        }, this.edit)),
        // The setting decides the skills, currency and extra blocks. Switching
        // keeps every rank; skills the new setting lacks are only hidden.
        labelled(
          "Setting",
          h(
            "select",
            {
              class: "field",
              "aria-label": "Setting",
              onchange: (e: Event) => {
                c.settingId = (e.target as HTMLSelectElement).value;
                this.actions.persist(this.library);
                this.render();
              },
            },
            ...SETTINGS.map((s) => h("option", { value: s.id, selected: s.id === c.settingId }, s.name)),
          ),
        ),
      ),
    );
  }

  private characteristics(c: Character): HTMLElement {
    return h(
      "div",
      { class: "sheet-section sec-characteristics" },
      h("h3", { class: "sheet-banner" }, "Characteristics"),
      h(
        "div",
        { class: "characteristics" },
        ...CHARACTERISTICS.map((key) =>
          h(
            "label",
            { class: "characteristic" },
            numberInput(c.characteristics[key], 1, 6, `${CHAR_NAMES[key]}`, (v) => {
              c.characteristics[key] = v;
              this.refreshAll();
            }, this.edit),
            h("span", { class: "characteristic-name" }, CHAR_NAMES[key]),
          ),
        ),
      ),
    );
  }

  private derived(c: Character): HTMLElement {
    const badge = (title: string, ...cells: HTMLElement[]) =>
      h("div", { class: "badge" }, h("span", { class: "badge-title" }, title), h("div", { class: "badge-cells" }, ...cells));
    const cell = (label: string, input: HTMLElement) => h("label", { class: "badge-cell" }, input, h("span", { class: "cell-label" }, label));
    return h(
      "div",
      { class: "sheet-section sec-derived" },
      h(
        "div",
        { class: "badges" },
        badge("Soak value", cell("Value", numberInput(c.soak, 0, 20, "Soak", (v) => (c.soak = v), this.edit))),
        badge(
          "Wounds",
          cell("Threshold", numberInput(c.wounds.threshold, 1, 99, "Wound threshold", (v) => (c.wounds.threshold = v), this.edit)),
          cell("Current", stepper(c.wounds.current, 0, 99, "Wounds suffered", (v) => (c.wounds.current = v), this.edit)),
        ),
        badge(
          "Strain",
          cell("Threshold", numberInput(c.strain.threshold, 1, 99, "Strain threshold", (v) => (c.strain.threshold = v), this.edit)),
          cell("Current", stepper(c.strain.current, 0, 99, "Strain suffered", (v) => (c.strain.current = v), this.edit)),
        ),
        badge(
          "Defense",
          cell("Melee", numberInput(c.defense.melee, 0, 9, "Melee defense", (v) => (c.defense.melee = v), this.edit)),
          cell("Ranged", numberInput(c.defense.ranged, 0, 9, "Ranged defense", (v) => (c.defense.ranged = v), this.edit)),
        ),
      ),
    );
  }

  private xp(c: Character): HTMLElement {
    return h(
      "div",
      { class: "sheet-section sec-xp" },
      h(
        "div",
        { class: "xp-row" },
        labelled("Total XP", numberInput(c.xp.total, 0, 9999, "Total XP", (v) => (c.xp.total = v), this.edit)),
        labelled("Available XP", numberInput(c.xp.available, 0, 9999, "Available XP", (v) => (c.xp.available = v), this.edit)),
      ),
    );
  }

  /**
   * Two columns, as on the printed sheet: general and magic skills on the
   * left; combat, social and knowledge on the right.
   */
  private skills(c: Character): HTMLElement {
    const setting = settingById(c.settingId);
    const head = (category: string) =>
      h("div", { class: "skill-group-head" }, h("span", {}, category), h("span", { class: "muted" }, "Career"), h("span", { class: "muted" }, "Rank"));
    const group = (category: string) =>
      h(
        "div",
        { class: "skill-group", role: "group", "aria-label": `${category} skills` },
        head(category),
        ...setting.skills.filter((s) => s.category === category).map((s) => this.skillRow(c, s)),
      );
    const left: string[] = setting.skillCategories.filter((cat) => cat === "General" || cat === "Magic");
    const right = setting.skillCategories.filter((cat) => !left.includes(cat));
    return h(
      "div",
      { class: "sheet-section skills-section sec-skills" },
      h("h3", { class: "sheet-heading sheet-banner" }, "Skills"),
      h(
        "div",
        { class: "skill-columns" },
        h("div", { class: "skill-column" }, ...left.map(group)),
        h("div", { class: "skill-column" }, ...right.map(group), this.customSkills(c, head)),
      ),
    );
  }

  /** The Custom Skills box: skills the GM adds for the campaign, named by the player. */
  private customSkills(c: Character, head: (category: string) => HTMLElement): HTMLElement {
    const box = h("div", { class: "skill-group custom-skills", role: "group", "aria-label": "Custom skills" });
    const draw = () => {
      box.replaceChildren(
        head("Custom"),
        ...c.customSkills.map((s, i) => this.customSkillRow(c, s, i, draw)),
        ...(c.customSkills.length < 8
          ? [
              h(
                "button",
                {
                  class: "text-button custom-add",
                  onclick: () => {
                    c.customSkills.push({ name: "", characteristic: "intellect", rank: 0, career: false });
                    this.changed();
                    draw();
                    box.querySelector<HTMLInputElement>(".custom-row:last-of-type input")?.focus();
                  },
                },
                "+ Custom skill",
              ),
            ]
          : []),
      );
    };
    draw();
    return box;
  }

  private customSkillRow(c: Character, s: CustomSkill, index: number, redraw: () => void): HTMLElement {
    const pips = h("span", { class: "pips", role: "radiogroup", "aria-label": `${s.name || "Custom skill"} rank` });
    const poolButton = h("button", {
      class: "pool-button",
      onclick: () => this.actions.roll(skillPool(c.characteristics[s.characteristic], s.rank), s.name || "Custom skill"),
    });
    const refresh = () => {
      pips.replaceChildren(
        ...[1, 2, 3, 4, 5].map((n) =>
          h("button", {
            class: "pip",
            role: "radio",
            "aria-checked": String(s.rank === n),
            "aria-label": `Rank ${n}`,
            dataset: { on: String(n <= s.rank) },
            onclick: () => {
              s.rank = s.rank === n ? n - 1 : n;
              this.changed();
              refresh();
            },
          }),
        ),
      );
      poolButton.replaceChildren(...poolGems(skillPool(c.characteristics[s.characteristic], s.rank)));
      poolButton.setAttribute("aria-label", `Put ${s.name || "custom skill"} dice in the tray`);
    };
    this.refreshers.push(refresh);
    refresh();

    const characteristic = h(
      "select",
      {
        class: "field custom-char",
        "aria-label": "Characteristic",
        onchange: (e: Event) => {
          s.characteristic = (e.target as HTMLSelectElement).value as Characteristic;
          this.changed();
          refresh();
        },
      },
      ...CHARACTERISTICS.map((k) => h("option", { value: k, selected: k === s.characteristic }, CHAR_SHORT[k])),
    );

    return h(
      "div",
      { class: "skill-row custom-row" },
      h(
        "span",
        { class: "skill-name custom-name" },
        textInput(s.name, 40, "Custom skill name", (v) => (s.name = v), this.edit, "Skill name"),
        characteristic,
        h("button", {
          class: "icon-button custom-remove",
          "aria-label": `Remove ${s.name || "this custom skill"}`,
          onclick: () => {
            c.customSkills.splice(index, 1);
            this.changed();
            redraw();
          },
        }, closeIcon()),
      ),
      checkbox(s.career, `${s.name || "Custom skill"} is a career skill`, (v) => (s.career = v), this.edit),
      pips,
      poolButton,
    );
  }

  private skillRow(c: Character, skill: SkillDefinition): HTMLElement {
    const pips = h("span", { class: "pips", role: "radiogroup", "aria-label": `${skill.name} rank` });
    const poolButton = h("button", { class: "pool-button", onclick: () => this.rollSkill(c, skill) });
    const career = h("input", {
      type: "checkbox",
      class: "career-box",
      checked: c.careerSkills.includes(skill.id),
      "aria-label": `${skill.name} is a career skill`,
      onchange: (e: Event) => {
        const on = (e.target as HTMLInputElement).checked;
        c.careerSkills = on ? [...new Set([...c.careerSkills, skill.id])] : c.careerSkills.filter((id) => id !== skill.id);
        this.changed();
      },
    });

    const refresh = () => {
      const rank = c.skillRanks[skill.id] ?? 0;
      pips.replaceChildren(
        ...[1, 2, 3, 4, 5].map((n) =>
          h("button", {
            class: "pip",
            role: "radio",
            "aria-checked": String(rank === n),
            "aria-label": `Rank ${n}`,
            dataset: { on: String(n <= rank) },
            // Clicking the current top rank clears it, so rank 1 can go back to 0.
            onclick: () => {
              const next = rank === n ? n - 1 : n;
              if (next > 0) c.skillRanks[skill.id] = next;
              else delete c.skillRanks[skill.id];
              this.changed();
              refresh();
            },
          }),
        ),
      );
      const pool = skillPool(c.characteristics[skill.characteristic], rank);
      poolButton.replaceChildren(...poolGems(pool));
      poolButton.setAttribute("aria-label", `Put ${skill.name} dice in the tray`);
      poolButton.title = `Put ${skill.name} dice in the tray`;
    };
    this.refreshers.push(refresh);
    refresh();

    return h(
      "div",
      { class: "skill-row" },
      h("span", { class: "skill-name" }, skill.name, h("span", { class: "muted" }, ` (${CHAR_SHORT[skill.characteristic]})`)),
      career,
      pips,
      poolButton,
    );
  }

  private weapons(c: Character): HTMLElement {
    const list = h("div", { class: "weapons" });
    const draw = () => {
      list.replaceChildren(
        ...(c.weapons.length
          ? c.weapons.map((w, i) => this.weaponCard(c, w, i, draw))
          : [h("p", { class: "muted" }, "No weapons yet.")]),
      );
    };
    draw();
    return h(
      "div",
      { class: "sheet-section sec-weapons" },
      h("h3", { class: "sheet-heading sheet-banner" }, "Weapons"),
      // Column titles for themes that show weapons as a table, like the printed sheet.
      h(
        "div",
        { class: "weapons-head", "aria-hidden": "true" },
        ...["Weapon", "Skill", "Damage", "Crit", "Range", "Special", ""].map((t) => h("span", {}, t)),
      ),
      list,
      h(
        "div",
        { class: "sheet-row end" },
        h(
          "button",
          {
            class: "secondary small",
            onclick: () => {
              c.weapons.push({ name: "", skillId: "melee", damage: 0, crit: 0, range: "Engaged", special: "" });
              this.changed();
              draw();
              list.querySelector<HTMLInputElement>(".weapon:last-child input")?.focus();
            },
          },
          "Add weapon",
        ),
      ),
    );
  }

  private weaponCard(c: Character, w: Weapon, index: number, redraw: () => void): HTMLElement {
    const poolButton = h("button", { class: "pool-button", onclick: () => this.rollWeapon(c, w) });
    const setting = settingById(c.settingId);
    const refresh = () => {
      const skill = setting.skills.find((s) => s.id === w.skillId);
      const pool = skill ? skillPool(c.characteristics[skill.characteristic], c.skillRanks[skill.id] ?? 0) : {};
      poolButton.replaceChildren(...poolGems(pool));
      poolButton.disabled = !skill;
      poolButton.setAttribute("aria-label", `Put ${w.name || "weapon"} dice in the tray`);
      poolButton.title = poolButton.getAttribute("aria-label")!;
    };
    this.refreshers.push(refresh);
    refresh();

    const skillSelect = h(
      "select",
      {
        class: "field",
        "aria-label": "Weapon skill",
        onchange: (e: Event) => {
          w.skillId = (e.target as HTMLSelectElement).value;
          this.changed();
          refresh();
        },
      },
      // A weapon whose skill this setting lacks shows as unset rather than silently changing.
      h("option", { value: "", selected: !setting.skills.some((s) => s.id === w.skillId) }, "Pick a skill"),
      ...setting.skillCategories.map((cat) =>
        h(
          "optgroup",
          { label: cat },
          ...setting.skills.filter((s) => s.category === cat).map((s) => h("option", { value: s.id, selected: s.id === w.skillId }, s.name)),
        ),
      ),
    );
    const range = h(
      "select",
      {
        class: "field",
        "aria-label": "Range",
        onchange: (e: Event) => {
          w.range = (e.target as HTMLSelectElement).value;
          this.changed();
        },
      },
      ...WEAPON_RANGES.map((r) => h("option", { value: r, selected: r === w.range }, r)),
    );

    return h(
      "div",
      { class: "weapon" },
      h(
        "div",
        { class: "weapon-top" },
        textInput(w.name, 80, "Weapon name", (v) => {
          w.name = v;
          refresh();
        }, this.edit),
        poolButton,
        h(
          "button",
          {
            class: "icon-button",
            "aria-label": `Remove ${w.name || "this weapon"}`,
            onclick: () => {
              c.weapons.splice(index, 1);
              this.changed();
              redraw();
            },
          },
          closeIcon(),
        ),
      ),
      h(
        "div",
        { class: "weapon-stats" },
        labelled("Skill", skillSelect),
        labelled("Damage", numberInput(w.damage, 0, 99, "Damage", (v) => (w.damage = v), this.edit)),
        labelled("Crit", numberInput(w.crit, 0, 9, "Critical rating", (v) => (w.crit = v), this.edit)),
        labelled("Range", range),
      ),
      labelled("Special", textInput(w.special, 200, "Special qualities", (v) => (w.special = v), this.edit)),
    );
  }

  // ---------- Managing characters ----------

  private manage(c: Character | null): HTMLElement {
    const status = h("p", { class: "muted", role: "status" });
    const say = (text: string) => (status.textContent = text);

    const picker =
      this.library.characters.length > 1 &&
      h(
        "select",
        {
          class: "field",
          "aria-label": "Character",
          onchange: (e: Event) => {
            this.library.activeId = (e.target as HTMLSelectElement).value;
            this.actions.persist(this.library);
            this.render();
          },
        },
        ...this.library.characters.map((ch) => h("option", { value: ch.id, selected: ch.id === this.library.activeId }, ch.name)),
      );

    const importBox = h("textarea", { class: "field import-box", rows: 3, placeholder: "Paste a share code or the contents of an exported file", spellcheck: false });
    const fileInput = h("input", {
      type: "file",
      accept: ".json,application/json",
      hidden: true,
      onchange: async () => {
        const file = fileInput.files?.[0];
        if (file) await this.importText(await file.text(), say);
        fileInput.value = "";
      },
    });
    const importArea = h(
      "div",
      { class: "import-area", hidden: true },
      importBox,
      h(
        "div",
        { class: "sheet-row end" },
        h("button", { class: "text-button", onclick: () => fileInput.click() }, "Choose a file…"),
        h("button", { class: "secondary small", onclick: () => void this.importText(importBox.value, say) }, "Import"),
      ),
      fileInput,
    );

    const confirmDelete = h("div", { class: "sheet-row confirm", hidden: true });
    const buttons = h(
      "div",
      { class: "manage-buttons" },
      h("button", { class: "text-button", onclick: () => this.create() }, "New"),
      h("button", { class: "text-button", "aria-expanded": "false", onclick: (e: Event) => {
        importArea.hidden = !importArea.hidden;
        (e.target as HTMLElement).setAttribute("aria-expanded", String(!importArea.hidden));
        if (!importArea.hidden) importBox.focus();
      } }, "Import"),
      c && h("button", { class: "text-button", onclick: () => download(exportFileName(c), exportJson(c)) }, "Export file"),
      c &&
        h(
          "button",
          {
            class: "text-button",
            onclick: async () => {
              const code = await shareCode(c);
              await navigator.clipboard?.writeText(code).then(
                () => say("Share code copied. Paste it to your GM or another browser, then use Import there."),
                () => say("Couldn't copy. Use Export file instead."),
              );
            },
          },
          "Copy share code",
        ),
      c &&
        h(
          "button",
          {
            class: "text-button danger-text",
            onclick: () => {
              confirmDelete.hidden = false;
              confirmDelete.replaceChildren(
                h("span", {}, `Delete ${c.name} from this browser? This can't be undone.`),
                h("button", { class: "secondary small danger", onclick: () => this.remove(c) }, "Delete"),
                h("button", { class: "text-button", onclick: () => (confirmDelete.hidden = true) }, "Keep"),
              );
            },
          },
          "Delete",
        ),
    );

    const disclaimer = h(
      "p",
      { class: "muted sheet-disclaimer" },
      "Unofficial fan-made tool, not affiliated with or endorsed by Fantasy Flight Games or Edge Studio. Genesys, Realms of Terrinoth and KeyForge are trademarks of their owners.",
    );
    return h("div", { class: "sheet-section sheet-manage" }, picker, buttons, confirmDelete, importArea, status, disclaimer);
  }

  /** New characters start in the same setting as the one on the sheet. */
  private create(): void {
    const c = createCharacter(settingById(this.active?.settingId));
    this.library.characters.push(c);
    this.library.activeId = c.id;
    this.actions.persist(this.library);
    this.render();
    this.body.querySelector<HTMLInputElement>(".sheet-name")?.select();
  }

  private remove(c: Character): void {
    this.library.characters = this.library.characters.filter((x) => x.id !== c.id);
    this.library.activeId = this.library.characters[0]?.id ?? null;
    this.actions.persist(this.library);
    this.render();
  }

  private async importText(input: string, say: (t: string) => void): Promise<void> {
    const c = await parseImport(input);
    if (!c) return say("That isn't a character file or share code. Check you copied all of it.");
    const existing = this.library.characters.findIndex((x) => x.id === c.id);
    if (existing >= 0) this.library.characters[existing] = c;
    else this.library.characters.push(c);
    this.library.activeId = c.id;
    this.actions.persist(this.library);
    this.render();
  }

  // ---------- Rolling ----------

  private rollSkill(c: Character, skill: SkillDefinition): void {
    this.actions.roll(skillPool(c.characteristics[skill.characteristic], c.skillRanks[skill.id] ?? 0), skill.name);
  }

  private rollWeapon(c: Character, w: Weapon): void {
    const skill = settingById(c.settingId).skills.find((s) => s.id === w.skillId);
    if (!skill) return;
    this.actions.roll(skillPool(c.characteristics[skill.characteristic], c.skillRanks[skill.id] ?? 0), w.name ? `${w.name} (${skill.name})` : skill.name);
  }

  private refreshAll(): void {
    for (const r of this.refreshers) r();
  }

}

// ---------- Helpers ----------

function download(name: string, contents: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type: "application/json" }));
  const a = h("a", { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
