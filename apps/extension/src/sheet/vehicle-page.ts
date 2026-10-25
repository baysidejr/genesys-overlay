// The vehicle sheet (KeyForge's): what the vehicle is, its silhouette,
// speed, handling and defense by zone, armor, hull trauma and system strain,
// its weapons, cargo hold and occupants. Only settings with a "vehicle" block
// show this page.
//
// A weapon's dice button rolls the character's own skill, since the
// character is the one firing it.

import { skillPool, VEHICLE_RANGES, type Character, type DicePool, type SettingDefinition, type VehicleWeapon } from "@genesys/shared";
import { h } from "../ui/dom";
import { labelled, numberInput, poolGems, removeButton, stepper, textArea, textInput, type Edited } from "./fields";

type Roll = (pool: DicePool, label: string) => void;

export function vehiclePage(c: Character, setting: SettingDefinition, edited: Edited, redraw: () => void, roll: Roll): Node[] {
  const v = c.vehicle;
  const badge = (title: string, ...cells: HTMLElement[]) =>
    h("div", { class: "badge" }, h("span", { class: "badge-title" }, title), h("div", { class: "badge-cells" }, ...cells));
  const cell = (label: string, input: HTMLElement) => h("label", { class: "badge-cell" }, input, h("span", { class: "cell-label" }, label));
  const stat = (name: string, input: HTMLElement) => h("label", { class: "characteristic vehicle-stat" }, input, h("span", { class: "characteristic-name" }, name));

  return [
    h(
      "div",
      { class: "sheet-section sheet-header sec-header sec-vehicle-header" },
      h("label", { class: "name-row" }, h("span", { class: "name-label" }, "Vehicle name"), sheetName(v.name, (x) => (v.name = x), edited)),
      h(
        "div",
        { class: "sheet-meta" },
        labelled("Make/Model", textInput(v.makeModel, 80, "Make and model", (x) => (v.makeModel = x), edited)),
        labelled("Control skill", textInput(v.controlSkill, 40, "Control skill", (x) => (v.controlSkill = x), edited, "Piloting, Operating…")),
        labelled("Details", textInput(v.details, 200, "Details", (x) => (v.details = x), edited)),
      ),
    ),
    h(
      "div",
      { class: "sheet-section sec-vehicle-stats" },
      h(
        "div",
        { class: "characteristics vehicle-stats" },
        stat("Silhouette", numberInput(v.silhouette, 0, 10, "Silhouette", (x) => (v.silhouette = x), edited)),
        stat("Max speed", numberInput(v.maxSpeed, 0, 5, "Max speed", (x) => (v.maxSpeed = x), edited)),
        stat("Handling", numberInput(v.handling, -3, 3, "Handling", (x) => (v.handling = x), edited)),
      ),
      h(
        "div",
        { class: "badges vehicle-badges" },
        badge("Armor", cell("Value", numberInput(v.armor, 0, 20, "Armor", (x) => (v.armor = x), edited))),
        badge(
          "Hull trauma",
          cell("Threshold", numberInput(v.hullTrauma.threshold, 0, 999, "Hull trauma threshold", (x) => (v.hullTrauma.threshold = x), edited)),
          cell("Current", stepper(v.hullTrauma.current, 0, 999, "Hull trauma", (x) => (v.hullTrauma.current = x), edited)),
        ),
        badge(
          "Strain threshold",
          cell("Threshold", numberInput(v.systemStrain.threshold, 0, 999, "System strain threshold", (x) => (v.systemStrain.threshold = x), edited)),
          cell("Current", stepper(v.systemStrain.current, 0, 999, "System strain", (x) => (v.systemStrain.current = x), edited)),
        ),
      ),
      defense(v.defense, edited),
    ),
    h(
      "div",
      { class: "sheet-section sec-weapons sec-vehicle-weapons" },
      h("h3", { class: "sheet-heading sheet-banner" }, "Weapons"),
      h(
        "div",
        { class: "weapons-head", "aria-hidden": "true" },
        ...["Weapon", "Skill", "Firing arc", "Damage", "Crit", "Range", "Special", ""].map((t) => h("span", {}, t)),
      ),
      h(
        "div",
        { class: "weapons" },
        ...(v.weapons.length
          ? v.weapons.map((w, i) => weaponRow(c, w, i, setting, edited, redraw, roll))
          : [h("p", { class: "muted" }, "No vehicle weapons yet.")]),
      ),
      h(
        "div",
        { class: "sheet-row end" },
        h(
          "button",
          {
            class: "secondary small",
            onclick: () => {
              v.weapons.push({ name: "", skillId: "gunnery", firingArc: "", damage: 0, crit: 0, range: "Close", special: "" });
              edited();
              redraw();
            },
          },
          "Add weapon",
        ),
      ),
    ),
    h(
      "div",
      { class: "sheet-section sec-cargo" },
      h("h3", { class: "sheet-heading sheet-banner" }, "Cargo hold"),
      h(
        "div",
        { class: "story-grid" },
        labelled("Encumbrance capacity", textArea(v.encumbrance, 200, "Encumbrance capacity", (x) => (v.encumbrance = x), edited, 2)),
        labelled("Consumables", textArea(v.consumables, 200, "Consumables", (x) => (v.consumables = x), edited, 2)),
      ),
      labelled("Cargo", textArea(v.cargo, 2000, "Cargo", (x) => (v.cargo = x), edited, 5)),
    ),
    h(
      "div",
      { class: "sheet-section sec-occupants" },
      h("h3", { class: "sheet-heading sheet-banner" }, "Occupants"),
      labelled("Crew", textArea(v.crew, 2000, "Crew", (x) => (v.crew = x), edited, 4)),
      labelled("Passengers", textArea(v.passengers, 2000, "Passengers", (x) => (v.passengers = x), edited, 4)),
    ),
  ];
}

function sheetName(value: string, set: (v: string) => void, edited: Edited): HTMLInputElement {
  const input = textInput(value, 80, "Vehicle name", set, edited, "Vehicle name");
  input.classList.add("sheet-name");
  return input;
}

/** Defense by zone, laid out like the printed sheet's dial: fore on top, aft below. */
function defense(d: Character["vehicle"]["defense"], edited: Edited): HTMLElement {
  const zone = (key: keyof typeof d, label: string) =>
    h("label", { class: `zone zone-${key}` }, numberInput(d[key], 0, 4, `${label} defense`, (x) => (d[key] = x), edited), h("span", { class: "zone-label" }, label));
  return h(
    "div",
    { class: "vehicle-defense", role: "group", "aria-label": "Defense by zone" },
    h("span", { class: "badge-title defense-title" }, "Defense"),
    h("div", { class: "defense-dial" }, zone("fore", "Fore"), zone("port", "Port"), zone("starboard", "Starboard"), zone("aft", "Aft")),
  );
}

function weaponRow(c: Character, w: VehicleWeapon, index: number, setting: SettingDefinition, edited: Edited, redraw: () => void, roll: Roll): HTMLElement {
  const poolButton = h("button", { class: "pool-button" });
  const pool = (): DicePool | null => {
    const skill = setting.skills.find((s) => s.id === w.skillId);
    return skill ? skillPool(c.characteristics[skill.characteristic], c.skillRanks[skill.id] ?? 0) : null;
  };
  const refresh = () => {
    const p = pool();
    poolButton.replaceChildren(...poolGems(p ?? {}));
    poolButton.disabled = !p;
    poolButton.setAttribute("aria-label", `Put ${w.name || "weapon"} dice in the tray`);
    poolButton.title = poolButton.getAttribute("aria-label")!;
  };
  poolButton.addEventListener("click", () => {
    const p = pool();
    if (p) roll(p, w.name || "Vehicle weapon");
  });
  refresh();

  const skillSelect = h(
    "select",
    {
      class: "field",
      "aria-label": "Weapon skill",
      onchange: (e: Event) => {
        w.skillId = (e.target as HTMLSelectElement).value;
        edited();
        refresh();
      },
    },
    h("option", { value: "", selected: !setting.skills.some((s) => s.id === w.skillId) }, "Pick a skill"),
    ...setting.skills
      .filter((s) => s.category === "Combat")
      .map((s) => h("option", { value: s.id, selected: s.id === w.skillId }, s.name)),
  );
  const range = h(
    "select",
    {
      class: "field",
      "aria-label": "Range",
      onchange: (e: Event) => {
        w.range = (e.target as HTMLSelectElement).value;
        edited();
      },
    },
    ...VEHICLE_RANGES.map((r) => h("option", { value: r, selected: r === w.range }, r)),
  );

  return h(
    "div",
    { class: "weapon vehicle-weapon" },
    h(
      "div",
      { class: "weapon-top" },
      textInput(w.name, 80, "Weapon name", (x) => {
        w.name = x;
        refresh();
      }, edited),
      poolButton,
      removeButton(`Remove ${w.name || "this weapon"}`, () => {
        c.vehicle.weapons.splice(index, 1);
        edited();
        redraw();
      }),
    ),
    h(
      "div",
      { class: "weapon-stats" },
      labelled("Skill", skillSelect),
      labelled("Firing arc", textInput(w.firingArc, 40, "Firing arc", (x) => (w.firingArc = x), edited, "Forward, All…")),
      labelled("Damage", numberInput(w.damage, 0, 99, "Damage", (x) => (w.damage = x), edited)),
      labelled("Crit", numberInput(w.crit, 0, 9, "Critical rating", (x) => (w.crit = x), edited)),
      labelled("Range", range),
    ),
    labelled("Special", textInput(w.special, 200, "Special qualities", (x) => (w.special = x), edited)),
  );
}
