import { AUTH_FORM_COPY } from "../constants/authForms";
import type { AuthFormFailure } from "../types/AuthFormFailure";

/** Plain words for a failed sign-up or reset. `unavailable` is the form's own line for when its captcha service is down. */
export function authFormFailureMessage(failure: AuthFormFailure, appName: string, unavailable: string): string {
  switch (failure) {
    case "captcha_rejected":
      return AUTH_FORM_COPY.captchaRejected;
    case "captcha_expired":
      return AUTH_FORM_COPY.captchaExpired;
    case "captcha_unavailable":
      return unavailable;
    case "invalid_email":
      return AUTH_FORM_COPY.emailInvalid;
    case "rate_limited":
      return AUTH_FORM_COPY.rateLimited;
    case "unreachable":
      return AUTH_FORM_COPY.unreachable(appName);
    case "unexpected":
      return AUTH_FORM_COPY.unexpected;
  }
}
