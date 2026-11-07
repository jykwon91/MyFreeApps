/**
 * Readable copy for the error details the auth pages can get back as a bare
 * `detail` string: fastapi-users codes, the TOTP login code, and the shared
 * rate limiter's message (`RATE_LIMIT_GENERIC_DETAIL` in platform_shared).
 * Anything not listed here is shown as the server sent it (see
 * `describeAuthError`).
 */
export const AUTH_ERROR_MESSAGES: ReadonlyMap<string, string> = new Map([
  ["LOGIN_BAD_CREDENTIALS", "Incorrect email or password. Please try again."],
  ["LOGIN_USER_NOT_VERIFIED", "Please verify your email before signing in."],
  ["invalid_totp", "Invalid authentication code. Please try again."],
  ["Too many attempts", "Too many attempts. Wait a few minutes and try again."],
  ["REGISTER_USER_ALREADY_EXISTS", "An account with this email already exists. Sign in instead."],
  ["VERIFY_USER_BAD_TOKEN", "This verification link is invalid or has expired."],
]);
