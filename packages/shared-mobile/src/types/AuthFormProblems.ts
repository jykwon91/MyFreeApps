import type { AuthFormFailure } from "./AuthFormFailure";

/** What's wrong on a captcha-checked form, outside its own fields' checks. */
export interface AuthFormProblems {
  emailError: string | undefined;
  /** Shown above the button, for a problem no field or the captcha can fix. */
  formError: string | undefined;
  setEmailError: (message: string | undefined) => void;
  /** Before a new submit. */
  clear: () => void;
  /** Says why the server refused, next to what to fix, and starts the captcha over: its token is spent. */
  show: (failure: AuthFormFailure) => void;
}
