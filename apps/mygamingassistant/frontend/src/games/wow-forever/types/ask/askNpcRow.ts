import type { Faction, PoiSource } from "@/games/wow-forever/types/worldMap";

/** One NPC on a results card, numbered like its marker on the card's map. */
export interface AskNpcRow {
  /** 1-based: the marker's number and the `n` Claude sees. */
  n: number;
  poiId: string;
  name: string;
  title: string;
  zoneId: number;
  zoneName: string;
  /** "Goldshire, Elwynn Forest". */
  area: string;
  x: number;
  y: number;
  faction: Faction;
  /** "about 6 min, ~6,100 yd" from the planned route; the map's "~350 yd away" when none could be planned. */
  distance: string;
  /** The planned route's steps, "walk → fly to Auberdine → boat to Darkshore"; null when none was planned. */
  route: string | null;
  source: PoiSource;
  capturedAt?: string;
}
