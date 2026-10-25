// Page 2 of the official sheet: who the character is and what they carry.
// Motivations, description, equipment, heroic ability (settings that have
// one), critical injuries, talents and special abilities, and notes.

import { INJURY_SEVERITIES, settingHas, type Character, type SettingDefinition, type Talent } from "@genesys/shared";
import { h } from "../ui/dom";
import { labelled, numberInput, poolGems, removeButton, select, textArea, textInput, type Edited } from "./fields";

// The printed sheet's order: Strength and Flaw on top, Desire and Fear below.
const MOTIVATIONS: [keyof Character["motivations"], string][] = [
  ["strength", "Strength"],
  ["flaw", "Flaw"],
  ["desire", "Desire"],
  ["fear", "Fear"],
];

export function storyPage(c: Character, setting: SettingDefinition, edited: Edited, redraw: () => void): Node[] {
  return [
    section(
      "Motivations",
      "motivations",
      h(
        "div",
        { class: "story-grid" },
        ...MOTIVATIONS.map(([key, label]) => labelled(label, textArea(c.motivations[key], 200, label, (v) => (c.motivations[key] = v), edited))),
      ),
    ),
    section(
      "Character description",
      "description",
      h(
        "div",
        { class: "story-grid" },
        ...setting.descriptionFields.map((field) => {
          const long = field === "Notable Features";
          const set = (v: string) => (c.description[field] = v);
          const input = long ? textArea(c.description[field] ?? "", 200, field, set, edited) : textInput(c.description[field] ?? "", 40, field, set, edited);
          const el = labelled(field, input);
          if (long) el.classList.add("span-all");
          return el;
        }),
      ),
    ),
    section(
      "Equipment log",
      "equipment",
      h(
        "div",
        { class: "money-row" },
        labelled(setting.currencyName, numberInput(c.equipment.currency, 0, 9_999_999, setting.currencyName, (v) => (c.equipment.currency = v), edited)),
        setting.secondCurrencyName &&
          labelled(setting.secondCurrencyName, numberInput(c.equipment.secondCurrency, 0, 9_999_999, setting.secondCurrencyName, (v) => (c.equipment.secondCurrency = v), edited)),
      ),
      h(
        "div",
        { class: "story-grid" },
        labelled("Weapons and armor", textArea(c.equipment.weaponsAndArmor, 2000, "Weapons and armor", (v) => (c.equipment.weaponsAndArmor = v), edited, 4)),
        labelled("Personal gear", textArea(c.equipment.personalGear, 2000, "Personal gear", (v) => (c.equipment.personalGear = v), edited, 4)),
      ),
    ),
    settingHas(setting, "heroicAbility") && heroicAbility(c, edited),
    injuries(c, edited, redraw),
    talentList(c, edited, redraw),
    section("Notes", "notes", textArea(c.notes, 2000, "Notes", (v) => (c.notes = v), edited, 3)),
  ].filter((n): n is HTMLElement => Boolean(n));
}

/** Realms of Terrinoth's heroic ability: what it is, where it came from, and its upgrades. */
function heroicAbility(c: Character, edited: Edited): HTMLElement {
  const a = c.heroicAbility;
  return section(
    "Heroic ability",
    "heroic",
    h(
      "div",
      { class: "heroic-grid" },
      labelled("Name", textInput(a.name, 80, "Heroic ability name", (v) => (a.name = v), edited)),
      labelled("Origin", textInput(a.origin, 80, "Origin", (v) => (a.origin = v), edited)),
      labelled("Ability", textInput(a.ability, 80, "Ability", (v) => (a.ability = v), edited)),
      labelled("Upgrades", textInput(a.upgrades, 200, "Upgrades", (v) => (a.upgrades = v), edited)),
    ),
    labelled("Effect", textArea(a.effect, 2000, "Effect", (v) => (a.effect = v), edited, 3)),
    h(
      "div",
      { class: "heroic-points" },
      labelled("Total ability points", numberInput(a.totalPoints, 0, 99, "Total ability points", (v) => (a.totalPoints = v), edited)),
      labelled("Available ability points", numberInput(a.availablePoints, 0, 99, "Available ability points", (v) => (a.availablePoints = v), edited)),
    ),
  );
}

/** `key` names the section (sec-key) so themes can lay the page out their own way. */
function section(title: string, key: string, ...children: Node[]): HTMLElement {
  return h("div", { class: `sheet-section sec-${key}` }, h("h3", { class: "sheet-heading" }, title), ...children);
}

function injuries(c: Character, edited: Edited, redraw: () => void): HTMLElement {
  const rows = c.criticalInjuries.map((injury, i) => {
    const dice = h("span", { class: "injury-dice", "aria-hidden": "true" });
    const showDice = () => dice.replaceChildren(...poolGems({ difficulty: INJURY_SEVERITIES.indexOf(injury.severity as never) + 1 }));
    showDice();
    return h(
      "div",
      { class: "injury" },
      h(
        "div",
        { class: "injury-severity" },
        select(injury.severity as (typeof INJURY_SEVERITIES)[number], INJURY_SEVERITIES, "Severity", (v) => {
          injury.severity = v;
          showDice();
        }, edited),
        dice,
      ),
      textInput(injury.result, 200, "Result", (v) => (injury.result = v), edited, "What happened"),
      removeButton(`Remove ${injury.result || "this injury"}`, () => {
        c.criticalInjuries.splice(i, 1);
        edited();
        redraw();
      }),
    );
  });
  return section(
    "Critical injuries",
    "injuries",
    ...(rows.length ? rows : [h("p", { class: "muted" }, "None. Long may it last.")]),
    addButton("Add injury", () => {
      c.criticalInjuries.push({ severity: "Easy", result: "" });
      edited();
      redraw();
    }),
  );
}

function talentList(c: Character, edited: Edited, redraw: () => void): HTMLElement {
  const sorted = c.talents.map((t, i) => ({ t, i })).sort((a, b) => (a.t.tier ?? 1) - (b.t.tier ?? 1));
  return section(
    "Talents and special abilities",
    "talents",
    // Column titles for themes that show talents as rows, like the printed sheet.
    h("div", { class: "talents-head", "aria-hidden": "true" }, h("span", {}, "Name"), h("span", {}, "Page #"), h("span", {}, "Ability summary")),
    ...(sorted.length
      ? sorted.map(({ t, i }) => talentCard(c, t, i, edited, redraw))
      : [h("p", { class: "muted" }, "No talents yet. Add them here or on the Talents page.")]),
    addButton("Add talent", () => {
      c.talents.push({ name: "", summary: "", active: false, tier: 1 });
      edited();
      redraw();
    }),
  );
}

function talentCard(c: Character, t: Talent, index: number, edited: Edited, redraw: () => void): HTMLElement {
  return h(
    "div",
    { class: "talent-card" },
    h(
      "div",
      { class: "talent-top" },
      textInput(t.name, 80, "Talent name", (v) => (t.name = v), edited, "Talent name"),
      h("span", { class: "tag tier-tag" }, `Tier ${t.tier ?? 1}`),
      removeButton(`Remove ${t.name || "this talent"}`, () => {
        c.talents.splice(index, 1);
        edited();
        redraw();
      }),
    ),
    h(
      "div",
      { class: "talent-meta" },
      labelled("Page", textInput(t.page ?? "", 20, "Rulebook page", (v) => (t.page = v || undefined), edited)),
    ),
    labelled("What it does", textArea(t.summary, 500, "Ability summary", (v) => (t.summary = v), edited)),
  );
}

function addButton(label: string, onclick: () => void): HTMLElement {
  return h("div", { class: "sheet-row end" }, h("button", { class: "secondary small", onclick }, label));
}
