/**
 * The code in the 409 the refinement answer routes (accept, accept-flagged, custom, skip) send when the suggestion
 * the client was showing is no longer the current one. Mirrors apps/myjobhunter/backend/app/core/resume_refinement_conflicts.py.
 */
export const REFINEMENT_CONFLICT_CODES = {
  suggestionChanged: "REFINEMENT_SUGGESTION_CHANGED",
} as const;
