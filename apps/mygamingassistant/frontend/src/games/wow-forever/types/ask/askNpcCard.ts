import type { ASK_CARD } from "@/games/wow-forever/data/ask/askCardKinds";
import type { AskNpcRow } from "@/games/wow-forever/types/ask/askNpcRow";
import type { AskOrigin } from "@/games/wow-forever/types/ask/askOrigin";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

/** `search_npcs`: the nearest matches on a small map. */
export interface AskNpcCard {
  kind: typeof ASK_CARD.npcs;
  query: string;
  origin: AskOrigin | null;
  /** The faction the search and its routes were planned as. */
  faction: PlayerFaction;
  rows: AskNpcRow[];
  /** Every match shown on the World Map, before the cut to `rows`. */
  total: number;
  /** Your faction had none, so these are the other faction's. */
  otherFaction: boolean;
}
