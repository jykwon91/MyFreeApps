import type { REFINEMENT_CONFLICT_CODES } from "../../constants/refinementConflictCodes";

/**
 * RTK Query error for an answer to a suggestion the session had already moved past. Mirrors the coded 409 in
 * apps/myjobhunter/backend/app/api/resume_refinement.py.
 */
export interface SuggestionChangedError {
  status: 409;
  data: {
    detail: {
      code: typeof REFINEMENT_CONFLICT_CODES.suggestionChanged;
      message: string;
    };
  };
}
