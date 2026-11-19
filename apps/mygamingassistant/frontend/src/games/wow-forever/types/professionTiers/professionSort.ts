import type { SortDirection } from "@/games/wow-forever/types/professionTiers/sortDirection";

/** A tiered profession grid's order: one sortable column and its direction. */
export interface ProfessionSort<K extends string> {
  key: K;
  direction: SortDirection;
}
