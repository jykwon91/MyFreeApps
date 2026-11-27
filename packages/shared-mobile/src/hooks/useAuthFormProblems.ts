import { useState } from "react";
import { authFormFailureMessage } from "../auth/authFormFailureMessage";
import type { AuthFormFailure } from "../types/AuthFormFailure";
import type { AuthFormProblems } from "../types/AuthFormProblems";
import type { TurnstileChallengeState } from "../types/TurnstileChallengeState";
import { authFormFailurePlace } from "../utils/authFormFailurePlace";

/**
 * The email and form-level problems of the sign-up and forgot-password forms, and where a server refusal shows.
 * `unavailable` is the form's own line for when its captcha service is down.
 */
export function useAuthFormProblems(appName: string, unavailable: string, turnstile: TurnstileChallengeState): AuthFormProblems {
  const [emailError, setEmailError] = useState<string>();
  const [formError, setFormError] = useState<string>();

  function clear(): void {
    setEmailError(undefined);
    setFormError(undefined);
  }

  function show(failure: AuthFormFailure): void {
    const message = authFormFailureMessage(failure, appName, unavailable);
    const place = authFormFailurePlace(failure);
    turnstile.reset(place === "captcha" ? message : undefined);
    if (place === "email") setEmailError(message);
    if (place === "form") setFormError(message);
  }

  return { emailError, formError, setEmailError, clear, show };
}
