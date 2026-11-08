import type { ChangeCategory } from "@/games/wow-forever/types/changes/changeCategory";
import type { ChangeKind } from "@/games/wow-forever/types/changes/changeKind";

/** The categories, in the page's order. Ids match the generator's `SHARDS`. */
export const CHANGE_CATEGORIES: readonly ChangeCategory[] = ["talents", "spells", "items", "quests", "zones"];

export const CHANGE_CATEGORY_LABEL: Readonly<Record<ChangeCategory, string>> = {
  talents: "Talents",
  spells: "Class spells",
  items: "Items",
  quests: "Quests",
  zones: "Zones & maps",
};

/** The chip on each row. */
export const CHANGE_KIND_LABEL: Readonly<Record<ChangeKind, string>> = {
  changed: "Changed",
  new: "New in Forever",
};

/** Categories whose rows carry classes, so the class filter shows and applies there. */
export const CLASS_TAGGED_CATEGORIES: ReadonlySet<ChangeCategory> = new Set<ChangeCategory>(["talents", "spells", "items"]);
