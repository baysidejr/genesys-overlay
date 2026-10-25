// Page 3 of the official sheet: the talent pyramid. Each talent costs 5 XP
// times its tier, and a character needs more talents in each tier than in
// the tier above. The page shows the pyramid apex-up and says plainly when
// the rule is broken; it doesn't stop the player, since the GM has the final say.

import { pyramidProblems, TALENT_TIERS, talentsInTier, talentXp, tierCost, type Character, type TalentTier } from "@genesys/shared";
import { h } from "../ui/dom";
import { checkbox, removeButton, textInput, type Edited } from "./fields";

export function talentsPage(c: Character, edited: Edited, redraw: () => void): Node[] {
  const problems = pyramidProblems(c.talents);
  const spent = talentXp(c.talents);

  const rows = [...TALENT_TIERS].reverse().map((tier) => tierRow(c, tier, edited, redraw));

  return [
    h(
      "div",
      { class: "sheet-section sec-pyramid-info" },
      h("h3", { class: "sheet-heading" }, "Purchasing talents"),
      h(
        "p",
        { class: "pyramid-lead" },
        "Each talent costs 5 XP times its tier. You need more talents in each tier than in the tier above it.",
      ),
      h(
        "div",
        { class: "pyramid-totals" },
        h("span", {}, h("strong", {}, `${spent} XP`), " spent on talents"),
        h("span", { class: "muted" }, `${c.xp.available} XP available`),
      ),
      h(
        "div",
        { class: "pyramid-status", role: "status", dataset: { ok: String(problems.length === 0) } },
        problems.length
          ? problems.map((p) => `Tier ${p.tier} needs ${p.needed} talents in tier ${p.tier - 1} (you have ${p.below}).`).join(" ")
          : "Your pyramid follows the rule.",
      ),
    ),
    h("div", { class: "sheet-section pyramid sec-pyramid" }, ...rows),
  ];
}

function tierRow(c: Character, tier: TalentTier, edited: Edited, redraw: () => void): HTMLElement {
  const talents = talentsInTier(c.talents, tier);
  return h(
    "div",
    { class: "tier", role: "group", "aria-label": `Tier ${tier}, ${tierCost(tier)} XP each` },
    h("div", { class: "tier-head" }, h("span", { class: "tier-name" }, `Tier ${tier}`), h("span", { class: "muted" }, `${tierCost(tier)} XP each`)),
    h(
      "div",
      { class: "tier-slots" },
      ...talents.map((t) =>
        h(
          "div",
          { class: "talent-slot", dataset: { active: String(t.active) } },
          textInput(t.name, 80, `Tier ${tier} talent name`, (v) => (t.name = v), edited, "Talent name"),
          h(
            "div",
            { class: "slot-meta" },
            h(
              "label",
              { class: "slot-active", title: "Active talents take an action or maneuver to use" },
              checkbox(t.active, "Active talent", (v) => (t.active = v), edited),
              "Active",
            ),
            textInput(t.page ?? "", 20, "Rulebook page", (v) => (t.page = v || undefined), edited, "Page"),
            removeButton(`Remove ${t.name || "this talent"}`, () => {
              c.talents.splice(c.talents.indexOf(t), 1);
              edited();
              redraw();
            }),
          ),
        ),
      ),
      h(
        "button",
        {
          class: "talent-add",
          "aria-label": `Add a tier ${tier} talent`,
          onclick: () => {
            c.talents.push({ name: "", summary: "", active: false, tier });
            edited();
            redraw();
          },
        },
        "+ Talent",
      ),
    ),
  );
}
