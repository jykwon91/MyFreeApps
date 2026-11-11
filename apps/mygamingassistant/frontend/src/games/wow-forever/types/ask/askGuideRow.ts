import type { WowIcon } from "@/games/wow-forever/types/icons/wowIcon";
import type { ProvenanceTag } from "@/games/wow-forever/types/provenance/provenanceTag";

/** One step of a profession route on the card. */
export interface AskGuideRow {
  /** "150–175". */
  skill: string;
  name: string;
  /** What the step makes (an enchant: its spell); null for a step that makes nothing in particular. */
  icon: WowIcon | null;
  /** Crafts, materials, where to learn it, the note — each its own line. */
  lines: string[];
  provenance: ProvenanceTag | null;
}
