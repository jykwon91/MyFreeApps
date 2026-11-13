import type { StatKey } from "@/games/wow-forever/data/statKeys";

/** How much one stat changes when the candidate replaces the equipped item; never 0. */
export interface StatDelta {
  key: StatKey;
  amount: number;
}
