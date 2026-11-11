/**
 * What the profile endpoints accept, from backend/app/schemas/profile: work_history_create_request.py,
 * education_create_request.py, skill_create_request.py and screening_answer_create_request.py.
 */
export const WORK_HISTORY_COMPANY_MAX_LENGTH = 200;
export const WORK_HISTORY_TITLE_MAX_LENGTH = 200;
export const WORK_HISTORY_BULLET_MAX_LENGTH = 2000;
export const WORK_HISTORY_BULLETS_MAX_COUNT = 30;
export const EDUCATION_SCHOOL_MAX_LENGTH = 200;
export const EDUCATION_DEGREE_MAX_LENGTH = 100;
export const EDUCATION_FIELD_MAX_LENGTH = 100;
export const EDUCATION_YEAR_MIN = 1950;
export const EDUCATION_YEAR_MAX = 2100;
export const EDUCATION_GPA_MAX = 9.99;
export const SKILL_NAME_MAX_LENGTH = 100;
export const SCREENING_ANSWER_MAX_LENGTH = 5000;
