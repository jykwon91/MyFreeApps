import type { ProfessionSort } from "@/games/wow-forever/types/professionTiers/professionSort";

/** One entry of a phone's "Sort by" select. */
export interface ProfessionSortChoice<K extends string> {
  id: string;
  label: string;
  sort: ProfessionSort<K>;
}
