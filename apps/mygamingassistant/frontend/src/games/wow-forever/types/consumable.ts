import type { FoodRestore } from "@/games/wow-forever/types/food";

/** A row of `data/food/consumables.json`: food or drink that isn't cooked — generated, never hand-edited. */
export interface ConsumableRecord {
  id: number;
  name: string;
  /** Level needed to eat it. */
  level: number;
  heal: FoodRestore | null;
  mana: FoodRestore | null;
  /** The Mage spell that conjures it; `level` is the Mage level it is learned at (null = the client doesn't say). */
  conjure: { spell: number; level: number | null } | null;
  /** What a vendor asks, in copper (Classic); null = no vendor sells it. */
  buyCopper: number | null;
}
