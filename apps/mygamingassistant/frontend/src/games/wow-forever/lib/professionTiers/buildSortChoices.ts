import type { ProfessionSortChoice } from "@/games/wow-forever/types/professionTiers/professionSortChoice";

/** The phone's "Sort by" choices: each key in both directions. */
export function buildSortChoices<K extends string>(keys: readonly K[], labels: Readonly<Record<K, string>>): ProfessionSortChoice<K>[] {
  return keys.flatMap((key) => [
    { id: `${key}:asc`, label: `${labels[key]} (low to high)`, sort: { key, direction: "asc" as const } },
    { id: `${key}:desc`, label: `${labels[key]} (high to low)`, sort: { key, direction: "desc" as const } },
  ]);
}
