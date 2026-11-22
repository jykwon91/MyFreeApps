import { RELATIONSHIP_LABELS } from "../constants/applicantReferenceLabels";

/** "Previous landlord" for "landlord"; an unknown value is shown as it came. */
export function referenceRelationshipLabel(relationship: string): string {
  return RELATIONSHIP_LABELS[relationship] ?? relationship;
}
