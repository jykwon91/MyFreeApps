/**
 * The header the backend's `require_turnstile` reads the captcha token from. None when the token is empty: in
 * development and CI the backend has no secret and skips the check.
 */
export function turnstileHeaders(turnstileToken: string): Record<string, string> {
  return turnstileToken ? { "X-Turnstile-Token": turnstileToken } : {};
}
