import {
  ADD_APPLICATION_FORM_PROBLEMS as PROBLEMS,
  JD_TEXT_MAX_LENGTH,
  JOB_URL_MAX_LENGTH,
} from "../constants/addApplicationForm";
import { textLength } from "./textLength";

/** Why a job link can't be read yet: longer than the backend accepts. Undefined when it fits. */
export function jobLinkLengthProblem(url: string): string | undefined {
  return textLength(url.trim()) > JOB_URL_MAX_LENGTH ? PROBLEMS.jobUrlTooLong : undefined;
}

/** Why a pasted job description can't be read yet: longer than the backend accepts. Undefined when it fits. */
export function jobDescriptionLengthProblem(text: string): string | undefined {
  return textLength(text.trim()) > JD_TEXT_MAX_LENGTH ? PROBLEMS.jdTextTooLong : undefined;
}
