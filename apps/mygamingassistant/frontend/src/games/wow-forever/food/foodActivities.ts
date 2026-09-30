/** What the player is about to do — decides what "best food" means. */
export type FoodActivity = "leveling" | "dungeon" | "raid" | "pvp" | "fishing" | "healing";

export const FOOD_ACTIVITIES: readonly { id: FoodActivity; label: string }[] = [
  { id: "leveling", label: "Leveling" },
  { id: "dungeon", label: "Dungeon" },
  { id: "raid", label: "Raid" },
  { id: "pvp", label: "PvP" },
  { id: "fishing", label: "Fishing" },
  { id: "healing", label: "Just healing" },
];

/** Echo-line wording: "…for a level 35 Warrior leveling". */
export const ACTIVITY_PHRASE: Record<FoodActivity, string> = {
  leveling: "leveling",
  dungeon: "in a dungeon",
  raid: "in a raid",
  pvp: "in PvP",
  fishing: "fishing",
  healing: "eating between fights",
};

export function findActivity(raw: string | null): FoodActivity | null {
  return FOOD_ACTIVITIES.find((a) => a.id === raw)?.id ?? null;
}
