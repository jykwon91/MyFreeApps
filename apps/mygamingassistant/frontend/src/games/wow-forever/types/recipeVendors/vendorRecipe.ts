import type { VendorSpot } from "@/games/wow-forever/types/recipeSources";

/** A recipe (or a rank's book) some vendor sells, ready to group by vendor. */
export interface VendorRecipe {
  /** The recipe item's id — unique within a guide. */
  itemId: number;
  /** "Recipe: Roast Raptor" — the name on the vendor's window. */
  name: string;
  /** The profession skill it asks to learn; null when the data doesn't say. */
  skill: number | null;
  /** What the vendor asks, in copper (Classic, before any reputation discount); null when not known. */
  price: number | null;
  /** On the guide's leveling route. */
  onRoute: boolean;
  vendors: readonly VendorSpot[];
}
