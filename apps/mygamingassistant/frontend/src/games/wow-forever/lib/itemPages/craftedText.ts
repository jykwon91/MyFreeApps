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

/** How `learnItem` reads for each kind of teacher. */
const TEACHER_TEXT: Readonly<Partial<Record<string, (teacher: string) => string>>> = {
  item: (teacher) => `learn from ${teacher}`,
  quest: (teacher) => `from the quest ${teacher}`,
  npc: (teacher) => `taught by ${teacher}`,
};

/** "Tailoring 215 · from a trainer" / "Tailoring 225 · learn from Pattern: Red Woolen Bag" / "Tailoring 285 · from the quest Sacred Cloth". */
export function craftedLine(crafted: CraftedBy): string {
  const teacher = TEACHER_TEXT[crafted.learn];
  const learn = teacher && crafted.learnItem ? teacher(crafted.learnItem) : (LEARN_TEXT[crafted.learn] ?? "");
  return [`${professionLabel(crafted.profession)} ${crafted.skill}`, learn].filter(Boolean).join(" · ");
}

/** The crafting guide at the recipe's skill. */
export function craftingGuideHref(crafted: CraftedBy): string {
  return `/wow-forever/professions?p=${crafted.profession}&skill=${crafted.skill}`;
}
