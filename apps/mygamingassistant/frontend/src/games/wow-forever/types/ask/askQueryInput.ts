/** A checked `find_places` / `search_items` / `dungeon_info` input. */
export interface AskQueryInput {
  query: string;
  /** Results at most (default 5). */
  limit: number;
}
