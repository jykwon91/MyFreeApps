import { SCREENING_QUESTIONS } from "../constants/screeningQuestions";
import type { ScreeningQuestion } from "../types/screening-answer/screening-question";

/** The questions not answered yet: each question takes one answer. */
export function unansweredScreeningQuestions(answeredKeys: readonly string[]): ScreeningQuestion[] {
  return SCREENING_QUESTIONS.filter((question) => !answeredKeys.includes(question.key));
}
