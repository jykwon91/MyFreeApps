import { INTERVIEWER_NAME_MAX_LENGTH, INTERVIEWERS_MAX } from "../constants/interviewDetailLimits";
import { interviewerNameTooLongMessage, tooManyInterviewersMessage } from "../constants/interviewerProblems";
import { parseInterviewerNames } from "./parseInterviewerNames";
import { textLength } from "@platform/core/utils/textLength";

/** Why the interviewers (one per line) can't be saved: too many names, or one too long. Undefined when they fit. */
export function interviewerNamesProblem(text: string): string | undefined {
  const names = parseInterviewerNames(text);
  if (names.length > INTERVIEWERS_MAX) return tooManyInterviewersMessage(INTERVIEWERS_MAX);
  if (names.some((name) => textLength(name) > INTERVIEWER_NAME_MAX_LENGTH)) {
    return interviewerNameTooLongMessage(INTERVIEWER_NAME_MAX_LENGTH);
  }
  return undefined;
}
