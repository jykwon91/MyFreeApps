/**
 * Readable copy for the fastapi-users error codes the auth pages can get
 * back as a bare `detail` string. Codes not listed here are shown as the
 * server sent them (see `describeAuthError`).
 */
export const AUTH_ERROR_MESSAGES: ReadonlyMap<string, string> = new Map([
  ["REGISTER_USER_ALREADY_EXISTS", "An account with this email already exists. Sign in instead."],
  ["VERIFY_USER_BAD_TOKEN", "This verification link is invalid or has expired."],
]);
