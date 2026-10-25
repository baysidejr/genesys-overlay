// Spells the character usually casts, like the pregenerated characters'
// spell sheets: each with its magic action, built-in effects, base
// difficulty, description, and optional additional effects that make the
// check harder. Every character has this page; players who don't cast
// simply leave it empty.
//
// The dice button puts the spell's check in the tray: the magic skill's dice
// plus the base difficulty and any additional effects ticked for this cast.

import {
  DIFFICULTIES,
  MAGIC_SKILLS,
  skillPool,
  type Character,
  type DicePool,
  type SettingDefinition,
  type Spell,
} from "@genesys/shared";
import { h } from "../ui/dom";
import { labelled, numberInput, poolGems, removeButton, textArea, textInput, type Edited } from "./fields";

type Roll = (pool: DicePool, label: string) => void;

export function spellsPage(c: Character, setting: SettingDefinition, edited: Edited, redraw: () => void, roll: Roll): Node[] {
  return [
    h(
      "div",
      { class: "sheet-section sec-spells-intro" },
      h("h3", { class: "sheet-heading" }, "Spells"),
      h(
        "p",
        { class: "spells-lead" },
        "Casting a spell is an action using a magic skill, and costs 2 strain. Note the spells you cast most; tick additional effects before casting to add their difficulty.",
      ),
    ),
    h(
      "div",
      { class: "sheet-section sec-spells" },
      ...(c.spells.length
        ? c.spells.map((s, i) => spellCard(c, s, i, setting, edited, redraw, roll))
        : [h("p", { class: "muted" }, "No spells yet. Characters who don't cast can leave this page empty.")]),
      h(
        "div",
        { class: "sheet-row end" },
        h(
          "button",
          {
            class: "secondary small",
            onclick: () => {
              c.spells.push({ name: "", skillId: MAGIC_SKILLS.find((id) => setting.skills.some((k) => k.id === id)) ?? "arcana", action: "", effects: "", difficulty: 2, text: "", options: [] });
              edited();
              redraw();
            },
          },
          "Add spell",
        ),
      ),
    ),
  ];
}

function spellCard(c: Character, s: Spell, index: number, setting: SettingDefinition, edited: Edited, redraw: () => void, roll: Roll): HTMLElement {
  // Additional effects picked for the next cast. Not saved: they change every time.
  const picked = new Set<number>();
  const poolButton = h("button", { class: "pool-button spell-cast" });

  const pool = (): DicePool => {
    const skill = setting.skills.find((k) => k.id === s.skillId);
    const base = skill ? skillPool(c.characteristics[skill.characteristic], c.skillRanks[skill.id] ?? 0) : {};
    const extra = [...picked].reduce((n, i) => n + (s.options[i]?.difficulty ?? 0), 0);
    return { ...base, difficulty: Math.min(s.difficulty + extra, 10) };
  };
  const refresh = () => {
    poolButton.replaceChildren(...poolGems(pool(), 13));
    poolButton.setAttribute("aria-label", `Put ${s.name || "spell"} dice in the tray`);
    poolButton.title = poolButton.getAttribute("aria-label")!;
  };
  poolButton.addEventListener("click", () => roll(pool(), s.name || "Spell"));
  refresh();

  // Magic skills the setting has (core has no Runes or Verse).
  const magic = MAGIC_SKILLS.filter((id) => setting.skills.some((k) => k.id === id));
  const skillName = (id: string) => setting.skills.find((k) => k.id === id)?.name ?? id;

  const options = h("div", { class: "spell-options" });
  const drawOptions = () => {
    options.replaceChildren(
      ...s.options.map((o, i) =>
        h(
          "div",
          { class: "spell-option" },
          h("input", {
            type: "checkbox",
            class: "career-box",
            "aria-label": `Add ${o.name || "this effect"} to the next cast`,
            title: "Add to the next cast",
            onchange: (e: Event) => {
              if ((e.target as HTMLInputElement).checked) picked.add(i);
              else picked.delete(i);
              refresh();
            },
          }),
          textInput(o.name, 60, "Effect name", (v) => (o.name = v), edited, "Effect"),
          labelled("+ Difficulty", numberInput(o.difficulty, 0, 4, "Extra difficulty", (v) => {
            o.difficulty = v;
            refresh();
          }, edited)),
          textInput(o.text, 500, "What it does", (v) => (o.text = v), edited, "What it does"),
          removeButton(`Remove ${o.name || "this effect"}`, () => {
            s.options.splice(i, 1);
            picked.clear();
            edited();
            drawOptions();
            refresh();
          }),
        ),
      ),
      h(
        "button",
        {
          class: "text-button",
          onclick: () => {
            s.options.push({ name: "", difficulty: 1, text: "" });
            edited();
            drawOptions();
          },
        },
        "+ Additional effect",
      ),
    );
  };
  drawOptions();

  const name = textInput(s.name, 80, "Spell name", (v) => (s.name = v), edited, "Spell name");
  name.classList.add("spell-name");

  return h(
    "article",
    { class: "spell" },
    h(
      "div",
      { class: "spell-top" },
      name,
      poolButton,
      removeButton(`Remove ${s.name || "this spell"}`, () => {
        c.spells.splice(index, 1);
        edited();
        redraw();
      }),
    ),
    h(
      "div",
      { class: "spell-meta" },
      labelled(
        "Skill",
        h(
          "select",
          {
            class: "field",
            "aria-label": "Magic skill",
            onchange: (e: Event) => {
              s.skillId = (e.target as HTMLSelectElement).value;
              edited();
              refresh();
            },
          },
          ...magic.map((id) => h("option", { value: id, selected: id === s.skillId }, skillName(id))),
        ),
      ),
      labelled("Magic action", textInput(s.action, 40, "Magic action", (v) => (s.action = v), edited, "Attack, Heal…")),
      labelled(
        "Difficulty",
        h(
          "select",
          {
            class: "field",
            "aria-label": "Base difficulty",
            onchange: (e: Event) => {
              s.difficulty = Number((e.target as HTMLSelectElement).value);
              edited();
              refresh();
            },
          },
          ...DIFFICULTIES.map((d, i) => h("option", { value: String(i + 1), selected: i + 1 === s.difficulty }, d)),
        ),
      ),
      labelled("Additional effects", textInput(s.effects, 200, "Built-in additional effects", (v) => (s.effects = v), edited, "Deadly, Range…")),
    ),
    labelled("What it does", textArea(s.text, 2000, "Spell description", (v) => (s.text = v), edited, 2)),
    h("h4", { class: "spell-options-title" }, "Additional effects"),
    options,
  );
}
