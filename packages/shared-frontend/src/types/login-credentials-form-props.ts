import type { ReactNode } from "react";
import type { LoginFormMode } from "./login-form-mode";

export interface LoginCredentialsFormProps {
  mode: LoginFormMode;
  onSubmit: (email: string, password: string) => Promise<void>;
  trustCopy: string;
  autoFocusEmail: boolean;
  /** Create-account form only: the password length hint and the submit gate. */
  passwordMinLength: number;
  /** Create-account form only: a captcha widget above the submit button. */
  captchaSlot?: ReactNode;
  /** Create-account form only: false keeps Create Account disabled. */
  captchaReady: boolean;
}
