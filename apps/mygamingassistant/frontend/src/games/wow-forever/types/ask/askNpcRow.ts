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
  /** "~350 yd away", "Kalimdor — boat or zeppelin needed". */
  distance: string;
  source: PoiSource;
  capturedAt?: string;
}
