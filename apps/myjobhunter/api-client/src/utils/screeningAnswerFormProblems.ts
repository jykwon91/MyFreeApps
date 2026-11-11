import { PROFILE_FORM_PROBLEMS as PROBLEMS } from "../constants/profileFormProblems";
import type { ScreeningAnswerFormProblems } from "../types/screening-answer/screening-answer-form-problems";
import type { ScreeningAnswerFormValues } from "../types/screening-answer/screening-answer-form-values";
import { screeningAnswerProblem } from "./screeningAnswerProblem";

/** What stops a screening answer saving. Empty when it can be saved. */
export function screeningAnswerFormProblems(values: ScreeningAnswerFormValues): ScreeningAnswerFormProblems {
  const problems: ScreeningAnswerFormProblems = {
    question_key: values.question_key ? undefined : PROBLEMS.questionRequired,
    answer: screeningAnswerProblem(values.answer),
  };
  return Object.fromEntries(Object.entries(problems).filter(([, problem]) => problem !== undefined));
}
