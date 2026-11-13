/**
 * The codes in the 409s Discover's Dismiss, Save and Restore answer with.
 * Mirrors apps/myjobhunter/backend/app/core/discovered_job_conflicts.py.
 */
export const DISCOVER_CONFLICT_CODES = {
  /** The posting (or its twin from another source) is already an application. */
  alreadyApplied: "DISCOVERED_JOB_ALREADY_APPLIED",
  /** A dismissed posting whose twin from another source is already in Discover. */
  duplicate: "DISCOVERED_JOB_DUPLICATE",
  /** The same, but that twin has since expired or closed: the posting is no longer listed. */
  noLongerListed: "DISCOVERED_JOB_NO_LONGER_LISTED",
} as const;
