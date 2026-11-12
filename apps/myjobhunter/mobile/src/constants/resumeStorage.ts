/** Where the phone keeps the session it's working on, so it opens there next time. SecureStore keys can't hold ":". */
export const RESUME_SESSION_ID_KEY = "mjh_resume_refinement_session_id";

/** The cache folder downloaded resumes pass through on their way to the share sheet, one subfolder per download. */
export const RESUME_EXPORT_DIRECTORY = "resume-exports";
