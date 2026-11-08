import type { ProvenanceTag } from "@/games/wow-forever/types/provenance/provenanceTag";

/** One step of a profession route on the card. */
export interface AskGuideRow {
  /** "150–175". */
  skill: string;
  name: string;
  /** Crafts, materials, where to learn it, the note — each its own line. */
  lines: string[];
  provenance: ProvenanceTag | null;
}
