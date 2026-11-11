import { SCREENING_QUESTIONS } from "../constants/screeningQuestions";
import { humanizeKey } from "./humanizeKey";

/** A question's label; a key this client doesn't know still reads sensibly. */
export function screeningQuestionLabel(questionKey: string): string {
  return SCREENING_QUESTIONS.find((question) => question.key === questionKey)?.label ?? humanizeKey(questionKey);
}
