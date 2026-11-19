import type { WritProduct } from "@/games/wow-forever/types/writs/writProduct";
import type { WritTier } from "@/games/wow-forever/types/writs/writTier";

/** One Craftsman's Writ as the data file lists it. */
export interface WritRecord {
  /** The writ item's id. */
  id: number;
  name: string;
  tier: WritTier;
  questId: number;
  /** The crafted item's name as the quest gives it; shown when `product` couldn't be matched. */
  productName: string;
  /** Null = no item matched `productName`. */
  product: WritProduct | null;
}
