import type { AuctionFilters } from "@/games/wow-forever/types/auctionHouse/auctionFilters";
import type { CraftingProfession } from "@/games/wow-forever/types/crafting";
import type { PriceFaction } from "@/games/wow-forever/types/priceFaction";

/** What the Auction house page hands its profession view. */
export interface ProfessionAuctionProps {
  profession: CraftingProfession;
  professionLabel: string;
  house: PriceFaction;
  recipe: number | null;
  onRecipe: (next: number | null) => void;
  filters: AuctionFilters;
  onFilters: (patch: Partial<AuctionFilters>) => void;
  onClearFilters: () => void;
}
