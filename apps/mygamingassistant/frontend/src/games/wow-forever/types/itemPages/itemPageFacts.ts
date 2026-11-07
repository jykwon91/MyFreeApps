import type { CraftedBy } from "@/games/wow-forever/types/itemPages/craftedBy";
import type { ItemBind } from "@/games/wow-forever/types/itemPages/itemBind";

/** What the Forever client says about an item beyond its stats. */
export interface ItemPageFacts {
  bind: ItemBind | null;
  /** What a vendor asks for it, in copper (the client's BuyPrice); null when it has none. */
  buyPrice: number | null;
  crafted: readonly CraftedBy[];
}
