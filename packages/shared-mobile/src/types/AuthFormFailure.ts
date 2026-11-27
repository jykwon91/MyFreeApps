/**
 * Why a captcha-checked form (sign-up, password reset) didn't go through. The captcha ones come from the backend's
 * Turnstile gate (`make_require_turnstile` in platform_shared).
 */
export type AuthFormFailure =
  | "captcha_rejected"
  | "captcha_expired"
  | "captcha_unavailable"
  | "invalid_email"
  | "rate_limited"
  | "unreachable"
  | "unexpected";
