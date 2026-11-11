import {
  EDUCATION_GPA_MAX,
  EDUCATION_YEAR_MAX,
  EDUCATION_YEAR_MIN,
  WORK_HISTORY_BULLET_MAX_LENGTH,
  WORK_HISTORY_BULLETS_MAX_COUNT,
} from "./profileFieldLimits";

/** Why a profile form can't be saved yet, worded the same on the website and the phone. */
export const PROFILE_FORM_PROBLEMS = {
  companyRequired: "Company is required",
  titleRequired: "Title is required",
  startDateRequired: "Start date is required",
  endBeforeStart: "The end date can't be before the start date.",
  tooManyBullets: `Keep it to ${WORK_HISTORY_BULLETS_MAX_COUNT} bullets.`,
  bulletTooLong: `Keep each bullet to ${WORK_HISTORY_BULLET_MAX_LENGTH.toLocaleString("en-US")} characters.`,
  schoolRequired: "School is required",
  year: `Enter a year from ${EDUCATION_YEAR_MIN} to ${EDUCATION_YEAR_MAX}.`,
  endYearBeforeStart: "The end year can't be before the start year.",
  gpa: `Enter a GPA from 0 to ${EDUCATION_GPA_MAX}, like 3.8.`,
  skillRequired: "Name the skill",
  skillDuplicate: "You already have this skill.",
  questionRequired: "Choose a question",
  screeningAlreadyAnswered: "That question already has an answer.",
} as const;
