import type { ClientItem } from "@/games/wow-forever/types/clientItem";

/** The decoded item list plus what search needs, built once per page load. */
export interface ClientItemList {
  items: readonly ClientItem[];
  byId: ReadonlyMap<number, ClientItem>;
  /** `searchNames[i]` / `searchWords[i]` are `items[i]`'s normalized name and its words. */
  searchNames: readonly string[];
  searchWords: readonly (readonly string[])[];
  clientBuild: string;
  attribution: string;
}
