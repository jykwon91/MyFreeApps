import { BOARD_TOKEN_PATTERN } from "../constants/savedSearchProblems";

/** True while a board token being typed already can't be valid; an empty field isn't flagged yet. */
export function isTypedBoardTokenInvalid(token: string): boolean {
  return token.length > 0 && !BOARD_TOKEN_PATTERN.test(token);
}
