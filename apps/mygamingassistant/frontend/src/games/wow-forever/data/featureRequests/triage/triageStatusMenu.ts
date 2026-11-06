/**
 * The status menu: only the next states that make sense from each status. The server accepts any
 * settable status; this is the operator's guard rail. `submitted` (inbox) and `duplicate` (merged) have none.
 */
import { TRIAGE_SHEET_KIND } from "@/games/wow-forever/data/featureRequests/triage/triageEnums";
import type { FeatureStoryStatus } from "@/games/wow-forever/types/featureRequests/featureStoryStatus";
import type { TriageStatusOption } from "@/games/wow-forever/types/featureRequests/triage/triageStatusOption";

const PLANNED: TriageStatusOption = { status: "planned", label: "Planned", sheet: null };
const IN_PROGRESS: TriageStatusOption = { status: "in_progress", label: "In progress", sheet: null };
const SHIPPED: TriageStatusOption = { status: "shipped", label: "Shipped…", sheet: TRIAGE_SHEET_KIND.shipped };
const NOT_PLANNED: TriageStatusOption = { status: "not_planned", label: "Not planned…", sheet: TRIAGE_SHEET_KIND.notPlanned };
const BACK_TO_OPEN: TriageStatusOption = { status: "open", label: "Open", sheet: null };
const REOPEN: TriageStatusOption = { status: "open", label: "Reopen", sheet: null };

export const TRIAGE_NEXT_STATUSES: Readonly<Record<FeatureStoryStatus, readonly TriageStatusOption[]>> = {
  submitted: [],
  open: [PLANNED, IN_PROGRESS, NOT_PLANNED],
  planned: [IN_PROGRESS, BACK_TO_OPEN, NOT_PLANNED],
  in_progress: [SHIPPED, PLANNED, NOT_PLANNED],
  shipped: [REOPEN],
  not_planned: [REOPEN],
  duplicate: [],
};
