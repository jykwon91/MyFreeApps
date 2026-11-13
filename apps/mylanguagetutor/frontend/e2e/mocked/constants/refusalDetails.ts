/** The `detail` strings the backend's tutor routes refuse with (app/api/turns.py, app/api/sessions.py). */
export const SESSION_NOT_FOUND = "session_not_found";
export const SESSION_ENDED = "session_ended";
export const SESSION_TURN_LIMIT = "session_turn_limit";
export const DAILY_LIMIT_REACHED = "daily_limit_reached";
export const TUTOR_UNAVAILABLE = "tutor_unavailable";
export const TURN_IN_PROGRESS = "turn_in_progress";
/** Starlette's plain-text body for an unhandled 500. */
export const INTERNAL_ERROR = "Internal Server Error";
/** The shared burst limiter's prose (platform_shared/core/auth_messages.py RATE_LIMIT_GENERIC_DETAIL), not a code. */
export const RATE_LIMIT_GENERIC_DETAIL = "Too many attempts";
/** fastapi-users' answer to a missing, expired or revoked token. */
export const UNAUTHORIZED = "Unauthorized";
/** require_current_password's refusal of a wrong password (platform_shared/auth/require_current_password.py), a 403. */
export const INCORRECT_PASSWORD = "Incorrect password";
/** fastapi-users' refusal of an unverified email at login (ErrorCode.LOGIN_USER_NOT_VERIFIED), a 400. */
export const LOGIN_USER_NOT_VERIFIED = "LOGIN_USER_NOT_VERIFIED";
