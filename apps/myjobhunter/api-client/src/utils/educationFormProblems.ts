import {
  EDUCATION_DEGREE_MAX_LENGTH,
  EDUCATION_FIELD_MAX_LENGTH,
  EDUCATION_GPA_MAX,
  EDUCATION_SCHOOL_MAX_LENGTH,
  EDUCATION_YEAR_MAX,
  EDUCATION_YEAR_MIN,
} from "../constants/profileFieldLimits";
import { PROFILE_FORM_PROBLEMS as PROBLEMS } from "../constants/profileFormProblems";
import type { EducationFormProblems } from "../types/education/education-form-problems";
import type { EducationFormValues } from "../types/education/education-form-values";
import { tooLongProblem } from "@platform/core/utils/tooLongProblem";

const WHOLE_YEAR = /^\d{4}$/;
/** What the server's two-decimal GPA column holds: "3", "3.8", "3.85". */
const GPA = /^\d(\.\d{1,2})?$/;

function yearProblem(value: string): string | undefined {
  const year = value.trim();
  if (!year) return undefined;
  const parsed = Number(year);
  return WHOLE_YEAR.test(year) && parsed >= EDUCATION_YEAR_MIN && parsed <= EDUCATION_YEAR_MAX ? undefined : PROBLEMS.year;
}

/** What stops a school saving, checked on what is sent. Empty when it can be saved. */
export function educationFormProblems(values: EducationFormValues): EducationFormProblems {
  const school = values.school.trim();
  const gpa = values.gpa.trim();
  const problems: EducationFormProblems = {
    school: school ? tooLongProblem(school, EDUCATION_SCHOOL_MAX_LENGTH) : PROBLEMS.schoolRequired,
    degree: tooLongProblem(values.degree.trim(), EDUCATION_DEGREE_MAX_LENGTH),
    field: tooLongProblem(values.field.trim(), EDUCATION_FIELD_MAX_LENGTH),
    start_year: yearProblem(values.start_year),
    end_year: yearProblem(values.end_year),
    gpa: gpa && !(GPA.test(gpa) && Number(gpa) <= EDUCATION_GPA_MAX) ? PROBLEMS.gpa : undefined,
  };
  if (!problems.start_year && !problems.end_year && values.start_year.trim() && values.end_year.trim()) {
    if (Number(values.end_year) < Number(values.start_year)) problems.end_year = PROBLEMS.endYearBeforeStart;
  }
  return Object.fromEntries(Object.entries(problems).filter(([, problem]) => problem !== undefined));
}
