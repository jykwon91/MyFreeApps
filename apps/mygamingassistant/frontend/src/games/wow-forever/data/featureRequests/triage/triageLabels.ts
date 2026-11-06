/** What the operator reads for each triage value. Chips and badges come only from these maps. */
import { STORY_STATUS_LABEL, STORY_STATUS_STYLE } from "@/games/wow-forever/data/featureRequests/featureRequestLabels";
import type { FeatureFeasibility } from "@/games/wow-forever/types/featureRequests/featureFeasibility";
import type { FeatureStoryStatus } from "@/games/wow-forever/types/featureRequests/featureStoryStatus";
import type { SubmissionVerdict } from "@/games/wow-forever/types/featureRequests/submissionVerdict";
import type { TriageSort } from "@/games/wow-forever/types/featureRequests/triage/triageSort";
import type { TriageStatusFilter } from "@/games/wow-forever/types/featureRequests/triage/triageStatusFilter";
import type { TriageTab } from "@/games/wow-forever/types/featureRequests/triage/triageTab";

export const TRIAGE_STATUS_LABEL: Readonly<Record<FeatureStoryStatus, string>> = {
  ...STORY_STATUS_LABEL,
  submitted: "Waiting for review",
  duplicate: "Merged",
};

export const TRIAGE_STATUS_STYLE: Readonly<Record<FeatureStoryStatus, string>> = {
  ...STORY_STATUS_STYLE,
  submitted: "border-border text-foreground",
  duplicate: "border-border text-muted-foreground",
};

export const TRIAGE_VERDICT_LABEL: Readonly<Record<SubmissionVerdict, string>> = {
  new: "New idea",
  duplicate: "Already asked",
  needs_clarification: "Asked a question",
  rejected: "Rejected",
};

export const TRIAGE_VERDICT_STYLE: Readonly<Record<SubmissionVerdict, string>> = {
  new: "border-sky-300 text-sky-800 dark:border-sky-700 dark:text-sky-200",
  duplicate: "border-violet-300 text-violet-800 dark:border-violet-700 dark:text-violet-200",
  needs_clarification: "border-amber-300 text-amber-800 dark:border-amber-700 dark:text-amber-200",
  rejected: "border-border text-muted-foreground",
};

export const TRIAGE_STATUS_FILTER_LABEL: Readonly<Record<TriageStatusFilter, string>> = {
  open: "Open",
  planned: "Planned",
  in_progress: "In progress",
  shipped: "Shipped",
  not_planned: "Not planned",
  hidden: "Hidden",
  merged: "Merged",
};

export const TRIAGE_SORT_LABEL: Readonly<Record<TriageSort, string>> = {
  top: "Most asked",
  priority: "Priority",
  new: "Newest",
};

export const TRIAGE_TAB_LABEL: Readonly<Record<TriageTab, string>> = {
  inbox: "Inbox",
  all: "All requests",
};

/** The operator's feasibility choices (the public chip hides "feasible"; the edit form names it). */
export const TRIAGE_FEASIBILITY_LABEL: Readonly<Record<FeatureFeasibility, string>> = {
  feasible: "Can be built",
  needs_data: "Waiting on Forever data",
  not_possible: "Can't build this",
};
