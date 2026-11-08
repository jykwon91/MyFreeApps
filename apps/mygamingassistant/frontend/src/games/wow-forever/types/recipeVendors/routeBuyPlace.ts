import type { SourceLookup } from "@/games/wow-forever/data/sourceDecode";
import type { RankBook } from "@/games/wow-forever/types/recipeSources";
import type { VendorPlace } from "@/games/wow-forever/types/recipeVendors/vendorPlace";

/** What a hand-written route needs to say where its recipes and rank's book are sold. */
export interface RouteBuyPlace {
  /** Recipe sources keyed by the food's id (the Cooking file). */
  sources: SourceLookup;
  /** The rank's book a "Buy the book" milestone points at; null when the guide has none. */
  book: RankBook | null;
  place: VendorPlace;
}
