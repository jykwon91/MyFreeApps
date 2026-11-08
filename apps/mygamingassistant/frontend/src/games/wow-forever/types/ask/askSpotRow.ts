import type { ProvenanceTag } from "@/games/wow-forever/types/provenance/provenanceTag";

/** One numbered spot on a rares or gold card: a mob at a place, marked on the card's map. */
export interface AskSpotRow {
  /** Unique on the card. */
  id: string;
  /** 1-based: the marker's number and the `n` Claude sees. */
  n: number;
  name: string;
  /** "Level 25 Rare elite · Forest's Edge, Elwynn Forest". */
  detail: string;
  /** A second line (drops, gold an hour), or null. */
  extra: string | null;
  zoneId: number;
  zoneName: string;
  /** 0..100 on the zone's map. */
  x: number;
  y: number;
  provenance: ProvenanceTag | null;
  /** "Show on the World Map" with every spot marked, or null. */
  mapHref: string | null;
}
