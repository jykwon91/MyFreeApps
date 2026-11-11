import { BOARD_TOKEN_PATTERN, SAVED_SEARCH_PROBLEMS } from "../constants/savedSearchProblems";

/** Why a Greenhouse board token can't be saved, or null. */
export function boardTokenProblem(token: string): string | null {
  const trimmed = token.trim();
  if (!trimmed) return SAVED_SEARCH_PROBLEMS.noBoardToken;
  return BOARD_TOKEN_PATTERN.test(trimmed) ? null : SAVED_SEARCH_PROBLEMS.badBoardToken;
}
