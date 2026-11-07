import type { SharedBisList } from "@/games/wow-forever/types/bisLists/sharedBisList";

/** A share link checked against the item list. */
export interface DecodedSharedList {
  list: SharedBisList;
  /** Rows the link named that were left out: an unknown item, or one that can't go in that row. */
  dropped: number;
}
