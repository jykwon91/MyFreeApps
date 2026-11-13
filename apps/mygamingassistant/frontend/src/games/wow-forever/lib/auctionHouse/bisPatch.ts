import { BIS_CHOICES, BIS_OFF_CHIP_ID, type BisChipId } from "@/games/wow-forever/data/auctionHouse/auctionBisOptions";
import type { AuctionFilters } from "@/games/wow-forever/types/auctionHouse/auctionFilters";
import type { BisChoice } from "@/games/wow-forever/types/auctionHouse/bisChoice";

/** What pressing a top-picks chip changes: Off, or pressing the chip that is on, clears it (and any level in the link); another chip switches to it. Pure. */
export function bisPatch(chip: BisChipId, current: BisChoice | null): Partial<AuctionFilters> {
  const choice = BIS_CHOICES.find((c) => String(c) === chip) ?? null;
  if (chip === BIS_OFF_CHIP_ID || choice === null || choice === current) return { bis: null, bisLevel: null };
  return { bis: choice };
}
