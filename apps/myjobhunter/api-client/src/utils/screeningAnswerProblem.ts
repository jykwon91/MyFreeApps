import { SCREENING_ANSWER_MAX_LENGTH } from "../constants/profileFieldLimits";
import { tooLongProblem } from "@platform/core/utils/tooLongProblem";

/** Why an answer can't be saved: only when it is too long, as a blank answer is allowed. */
export function screeningAnswerProblem(answer: string): string | undefined {
  return tooLongProblem(answer.trim(), SCREENING_ANSWER_MAX_LENGTH);
}
