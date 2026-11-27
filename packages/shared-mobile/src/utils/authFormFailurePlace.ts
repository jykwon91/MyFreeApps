import type { AuthFormFailure } from "../types/AuthFormFailure";
import type { AuthFormFailurePlace } from "../types/AuthFormFailurePlace";

/** Next to what the person can fix: the captcha to do again, or the email to correct. Anything else goes above the button. */
export function authFormFailurePlace(failure: AuthFormFailure): AuthFormFailurePlace {
  if (failure === "captcha_rejected" || failure === "captcha_expired") return "captcha";
  if (failure === "invalid_email") return "email";
  return "form";
}
