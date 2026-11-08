import type { Faction } from "@/games/wow-forever/types/worldMap";

/** One row of `questIndex.json`, fully decoded. */
export interface QuestIndexEntry {
  id: number;
  /** null = not yet named in our data ("Quest #id"). */
  name: string | null;
  level: number;
  minLevel: number;
  side: Faction;
  /** UiMap zone id; null = no giver on the World Map. */
  zoneId: number | null;
  /** True when this quest isn't in the Classic Era client. */
  isNew: boolean;
  /** Name lower-cased and split for the search filter, or [] when name is null. */
  searchWords: string[];
}
