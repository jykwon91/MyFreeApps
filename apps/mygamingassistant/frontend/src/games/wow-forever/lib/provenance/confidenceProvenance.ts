import { PROVENANCE_DETAIL } from "@/games/wow-forever/data/provenance/provenanceLabels";
import { CLASSIC_ROUTE_TAG, CLASSIC_RULE_TAG } from "@/games/wow-forever/data/provenance/provenanceTags";
import type { Confidence } from "@/games/wow-forever/data/professions/professionTypes";
import { CONFIDENCE_BASIS, type ConfidenceBasis } from "@/games/wow-forever/types/confidenceBasis";
import { PROVENANCE } from "@/games/wow-forever/types/provenance/provenance";
import type { ProvenanceTag } from "@/games/wow-forever/types/provenance/provenanceTag";

const BASIS_TAG: Readonly<Record<ConfidenceBasis, ProvenanceTag>> = {
  [CONFIDENCE_BASIS.beta]: { provenance: PROVENANCE.unconfirmed, detail: PROVENANCE_DETAIL.betaReport },
  [CONFIDENCE_BASIS.classic]: CLASSIC_ROUTE_TAG,
  [CONFIDENCE_BASIS.classicRule]: CLASSIC_RULE_TAG,
};

/**
 * The badge for a Professions row (`confidence` + optional `basis`). A confirmed
 * row was checked against Forever and carries no badge; an unconfirmed one is
 * Classic data when it rests on Classic, else Unconfirmed (beta reports too).
 */
export function confidenceProvenance(confidence: Confidence, basis?: ConfidenceBasis): ProvenanceTag | null {
  if (confidence === "confirmed") return null;
  if (!basis) return { provenance: PROVENANCE.unconfirmed };
  return BASIS_TAG[basis];
}
