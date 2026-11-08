import type { AskFactionFilter } from "@/games/wow-forever/types/ask/askFactionFilter";
import type { AskQueryInput } from "@/games/wow-forever/types/ask/askQueryInput";

/** A checked `search_npcs` input. */
export interface AskNpcSearchInput extends AskQueryInput {
  /** Where the player said they are; null = their saved location. */
  fromZone: string | null;
  /** null = the player's own faction plus neutral. */
  faction: AskFactionFilter | null;
}
