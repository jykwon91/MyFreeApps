import type { TriageSheetKind } from "@/games/wow-forever/types/featureRequests/triage/triageSheetKind";

export interface TriageOpenSheet {
  kind: TriageSheetKind;
  storyId: string;
  /** The inbox submission the sheet was opened from (prefills "Add note to story"). */
  fromSubmissionId: string | null;
}
