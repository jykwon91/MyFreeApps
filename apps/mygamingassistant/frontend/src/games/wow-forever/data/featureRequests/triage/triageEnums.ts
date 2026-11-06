/**
 * Fixed values for the operator's triage screen (`/wow-forever/triage`). The status lists mirror the
 * backend's `feature_literals.py` (`TriageSettableStatus`); the rest are this screen's own.
 */

/** Every status triage may PATCH — `duplicate` is only made by a merge. */
export const TRIAGE_SETTABLE_STATUSES = ["submitted", "open", "planned", "in_progress", "shipped", "not_planned"] as const;

export const TRIAGE_TABS = ["inbox", "all"] as const;

/** The All requests chips, in the order they show. */
export const TRIAGE_STATUS_FILTERS = [
  "open",
  "planned",
  "in_progress",
  "shipped",
  "not_planned",
  "hidden",
  "merged",
] as const;

export const TRIAGE_SORTS = ["top", "priority", "new"] as const;

export const TRIAGE_SHEET_KINDS = ["edit", "merge", "shipped", "not_planned"] as const;

/** Private priority, 1 = most important (backend PRIORITY_MIN..PRIORITY_MAX). */
export const TRIAGE_PRIORITIES = [1, 2, 3] as const;

/** Statuses a story can be merged into (never itself, a merged story or a hidden one). */
export const MERGE_TARGET_STATUSES = ["open", "planned", "in_progress", "shipped", "not_planned"] as const;
