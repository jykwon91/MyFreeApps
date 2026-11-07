import { CRAFTING_GROUP, SECONDARY_GROUP } from "@/games/wow-forever/data/professions/professionPicker";
import type { CraftedBy } from "@/games/wow-forever/types/itemPages/craftedBy";

const LEARN_TEXT: Readonly<Record<string, string>> = {
  start: "known from the start",
  trainer: "from a trainer",
};

/** "Tailoring". */
export function professionLabel(profession: CraftedBy["profession"]): string {
  return [...CRAFTING_GROUP.options, ...SECONDARY_GROUP.options].find((o) => o.id === profession)?.label ?? profession;
}

/** "Tailoring 215 · from a trainer" / "Tailoring 225 · learn from Pattern: Red Woolen Bag". */
export function craftedLine(crafted: CraftedBy): string {
  const learn = crafted.learn === "item" && crafted.learnItem ? `learn from ${crafted.learnItem}` : (LEARN_TEXT[crafted.learn] ?? "");
  return [`${professionLabel(crafted.profession)} ${crafted.skill}`, learn].filter(Boolean).join(" · ");
}

/** "2 × Bolt of Silk Cloth, 1 × Spool of Silk Thread". */
export function reagentsLine(crafted: CraftedBy): string {
  return crafted.reagents.map((r) => `${r.count} × ${r.name}`).join(", ");
}

/** The crafting guide at the recipe's skill. */
export function craftingGuideHref(crafted: CraftedBy): string {
  return `/wow-forever/professions?p=${crafted.profession}&skill=${crafted.skill}`;
}
