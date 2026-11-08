import type { ASK_CARD } from "@/games/wow-forever/data/ask/askCardKinds";
import type { AskPlaceRow } from "@/games/wow-forever/types/ask/askPlaceRow";

/** `find_places`: zones, towns and buildings by name. */
export interface AskPlacesCard {
  kind: typeof ASK_CARD.places;
  query: string;
  rows: AskPlaceRow[];
}
