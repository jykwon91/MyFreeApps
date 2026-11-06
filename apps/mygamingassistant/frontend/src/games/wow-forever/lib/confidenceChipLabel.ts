import { CONFIDENCE_BASIS_LABEL, UNCONFIRMED_LABEL } from "@/games/wow-forever/data/professions/confidenceBasisLabel";
import type { ConfidenceBasis } from "@/games/wow-forever/types/confidenceBasis";

/** "Reported in the beta" / "Classic route — may differ in Forever"; plain "Unconfirmed" with no basis. */
export function confidenceChipLabel(basis: ConfidenceBasis | undefined): string {
  if (!basis) return UNCONFIRMED_LABEL;
  return CONFIDENCE_BASIS_LABEL[basis];
}
