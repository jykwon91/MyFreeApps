import type { ItemSources } from "@/games/wow-forever/types/recipeSources";

/** A recipe (or rank's book) a route row has you buy, with everything known about where it's sold. */
export interface RecipeBuy {
  itemId: number;
  name: string;
  sources: ItemSources;
}
