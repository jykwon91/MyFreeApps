/** `data/library/library.json` as the generator writes it (`scripts/wow_library/build.py`). */
export interface LibraryDataFile {
  clientBuild: number;
  seenOn: string;
  bookColumns: string[];
  books: (string | number)[][];
  cardColumns: string[];
  cards: (string | number)[][];
  questColumns: string[];
  /** [id, title, level, minLevel, rewards [[itemId, count]], choices [[itemId, count]]] */
  quests: [number, string, number, number, [number, number][], [number, number][]][];
  itemColumns: string[];
  /** Item id -> [name, quality, slot]. */
  items: Record<string, [string, string, string | null]>;
}
