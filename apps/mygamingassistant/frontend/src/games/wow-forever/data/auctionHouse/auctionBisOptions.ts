import { PRE_RAID_LEVEL } from "@/games/wow-forever/data/gear/gearPageConfig";
import type { AuctionChipOption } from "@/games/wow-forever/types/auctionHouse/auctionChipOption";
import type { BisChoice } from "@/games/wow-forever/types/auctionHouse/bisChoice";
import type { BisRank } from "@/games/wow-forever/types/auctionHouse/bisRank";

/** The picks kept per slot. */
export const BIS_RANKS: readonly BisRank[] = [1, 2, 3];

/** The values `?bis=` accepts, as they appear in a link. */
export const BIS_CHOICES: readonly BisChoice[] = ["any", ...BIS_RANKS];

/** The chip that switches the filter off; not a link value. */
export const BIS_OFF_CHIP_ID = "off";

/** At this level the picks are the pre-raid best in slot; below it they are the best you can wear then. */
export const BIS_LEVEL = PRE_RAID_LEVEL;

export type BisChipId = typeof BIS_OFF_CHIP_ID | `${BisChoice}`;

export const BIS_CHIPS: readonly AuctionChipOption<BisChipId>[] = [
  { id: BIS_OFF_CHIP_ID, label: "Off" },
  { id: "any", label: "Any top 3" },
  { id: "1", label: "#1" },
  { id: "2", label: "#2" },
  { id: "3", label: "#3" },
];
