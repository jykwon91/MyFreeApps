import {
  WORK_HISTORY_BULLET_MAX_LENGTH,
  WORK_HISTORY_BULLETS_MAX_COUNT,
  WORK_HISTORY_COMPANY_MAX_LENGTH,
  WORK_HISTORY_TITLE_MAX_LENGTH,
} from "../constants/profileFieldLimits";
import { PROFILE_FORM_PROBLEMS as PROBLEMS } from "../constants/profileFormProblems";
import type { WorkHistoryFormProblems } from "../types/work-history/work-history-form-problems";
import type { WorkHistoryFormValues } from "../types/work-history/work-history-form-values";
import { bulletsFromText } from "./bulletsFromText";
import { textLength } from "./textLength";
import { tooLongProblem } from "./tooLongProblem";

/** What stops a role saving, checked on what is sent. Empty when it can be saved. */
export function workHistoryFormProblems(values: WorkHistoryFormValues): WorkHistoryFormProblems {
  const problems: WorkHistoryFormProblems = {};
  const company = values.company_name.trim();
  const title = values.title.trim();
  const bullets = bulletsFromText(values.bullets);
  problems.company_name = company ? tooLongProblem(company, WORK_HISTORY_COMPANY_MAX_LENGTH) : PROBLEMS.companyRequired;
  problems.title = title ? tooLongProblem(title, WORK_HISTORY_TITLE_MAX_LENGTH) : PROBLEMS.titleRequired;
  if (!values.start_date) problems.start_date = PROBLEMS.startDateRequired;
  // ISO dates compare as strings.
  if (!values.is_current && values.start_date && values.end_date && values.end_date < values.start_date) {
    problems.end_date = PROBLEMS.endBeforeStart;
  }
  if (bullets.length > WORK_HISTORY_BULLETS_MAX_COUNT) problems.bullets = PROBLEMS.tooManyBullets;
  else if (bullets.some((bullet) => textLength(bullet) > WORK_HISTORY_BULLET_MAX_LENGTH)) problems.bullets = PROBLEMS.bulletTooLong;
  return Object.fromEntries(Object.entries(problems).filter(([, problem]) => problem !== undefined));
}
