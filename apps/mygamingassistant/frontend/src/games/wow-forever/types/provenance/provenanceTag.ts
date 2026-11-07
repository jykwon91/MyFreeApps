import type { Provenance } from "@/games/wow-forever/types/provenance/provenance";

/** A fact's provenance badge: its kind, plus optional extras for the badge's explanation. */
export interface ProvenanceTag {
  provenance: Provenance;
  /** An extra line under the badge's description, e.g. why an unconfirmed row is listed. */
  detail?: string;
  /** For `seen`: when it was seen, already formatted for display. */
  date?: string;
}
