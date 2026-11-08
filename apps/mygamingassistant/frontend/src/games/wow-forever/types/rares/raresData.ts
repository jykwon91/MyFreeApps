import type { Rare } from "@/games/wow-forever/types/rares/rare";
import type { RareZone } from "@/games/wow-forever/types/rares/rareZone";

/** The rares finder's data, decoded. */
export interface RaresData {
  /** Lowest level first; rares with no level last, then by name. */
  rares: readonly Rare[];
  /** Every zone a rare spawns in, by name. */
  zones: readonly RareZone[];
  /** The day the operator's Forever client cache was last written. */
  seenOn: string;
  clientBuild: number;
}
