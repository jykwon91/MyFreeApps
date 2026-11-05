import type { ClientItem } from "@/games/wow-forever/types/clientItem";

export interface ItemSearchResult {
  items: readonly ClientItem[];
  /** No item matched every word exactly, so these are spelling-tolerant matches. */
  fuzzy: boolean;
  /** Matches left out because the class filter's class can't use them. */
  hiddenByClass: number;
}
