import type { ProfessionSort } from "@/games/wow-forever/types/professionTiers/professionSort";

/** A header click: the same column flips its direction, another starts low to high. */
export function nextSort<K extends string>(current: ProfessionSort<K>, key: K): ProfessionSort<K> {
  return { key, direction: current.key === key && current.direction === "asc" ? "desc" : "asc" };
}
