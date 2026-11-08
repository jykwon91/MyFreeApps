import type { PlaceKind } from "@/games/wow-forever/worldMap/places";

/** One place on a places card. */
export interface AskPlaceRow {
  placeId: string;
  name: string;
  kind: PlaceKind;
  /** "Goldshire, Elwynn Forest". */
  label: string;
  zoneId: number;
  /** "10–20" when its zone has a level range. */
  levels: string | null;
}
