import type { TriageSettableStatus } from "@/games/wow-forever/types/featureRequests/triage/triageSettableStatus";

/** One entry in the status menu. A `sheet` status opens a sheet first instead of applying with Undo. */
export interface TriageStatusOption {
  status: TriageSettableStatus;
  label: string;
  sheet: "shipped" | "not_planned" | null;
}
