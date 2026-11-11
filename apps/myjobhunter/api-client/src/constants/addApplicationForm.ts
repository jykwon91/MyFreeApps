import { APPLICATION_NOTES_MAX_LENGTH } from "./textFieldLimits";

// The company name limit lives with the other company limits; re-exported for the add-application flow.
export { COMPANY_NAME_MAX_LENGTH } from "./companyFieldLimits";

// Notes share APPLICATION_NOTES_MAX_LENGTH. Bounds mirror ApplicationCreateRequest, CompanyCreateRequest and JdParseRequest on the backend.
export const ROLE_TITLE_MAX_LENGTH = 200;
export const LOCATION_MAX_LENGTH = 200;
/** Pydantic's `AnyHttpUrl` refuses a URL over 2083 characters (`JdUrlExtractRequest`, `ApplicationCreateRequest`); their `_URL_MAX_LEN` of 2048 is not enforced. */
export const JOB_URL_MAX_LENGTH = 2083;
export const JD_TEXT_MAX_LENGTH = 50000;

/** A whole pasted value that is a job-posting link, so it can be read without a button press. */
export const JOB_URL_PATTERN = /^https?:\/\/\S+$/i;

/** After this long reading a posting, the wait copy says it's taking longer than usual. */
export const JD_READ_LONG_RUNNING_MS = 3000;

/** The backend's 422 detail when a link is behind a sign-in (LinkedIn, Glassdoor). */
export const JD_AUTH_REQUIRED_DETAIL = "auth_required";

export const ADD_APPLICATION_FORM_PROBLEMS = {
  roleTitleRequired: "Role title is required",
  roleTitleTooLong: `Keep the role title to ${ROLE_TITLE_MAX_LENGTH} characters.`,
  locationTooLong: `Keep the location to ${LOCATION_MAX_LENGTH} characters.`,
  notesTooLong: `Keep the notes to ${APPLICATION_NOTES_MAX_LENGTH} characters.`,
  jobUrlTooLong: `That link is longer than ${JOB_URL_MAX_LENGTH} characters, which is more than can be read.`,
  jdTextTooLong: `Keep the job description to ${JD_TEXT_MAX_LENGTH.toLocaleString("en-US")} characters.`,
} as const;
