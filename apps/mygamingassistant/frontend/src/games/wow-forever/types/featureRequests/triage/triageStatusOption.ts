import type { TRIAGE_SHEET_KIND } from "@/games/wow-forever/data/featureRequests/triage/triageEnums";
import type { TriageSettableStatus } from "@/games/wow-forever/types/featureRequests/triage/triageSettableStatus";

/** One entry in the status menu. A `sheet` status opens a sheet first instead of applying with Undo. */
export interface TriageStatusOption {
  status: TriageSettableStatus;
  label: string;
  sheet: typeof TRIAGE_SHEET_KIND.shipped | typeof TRIAGE_SHEET_KIND.notPlanned | null;
}
