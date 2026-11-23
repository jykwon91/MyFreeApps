import type { ReactNode } from "react";
import type { LoginFormMode } from "./login-form-mode";

/** LoginForm signs people up itself, on a Create Account tab. */
export interface LoginFormTabRegistration {
  onRegister: (email: string, password: string) => Promise<void>;
  registerHref?: never;
  defaultTab?: LoginFormMode;
  passwordMinLength?: number;
  /**
   * Optional element rendered above the submit button on the register tab.
   * Intended for a Cloudflare Turnstile widget. When the consumer's
   * environment doesn't configure Turnstile the slot can stay null —
   * passing it doesn't change the form layout when the widget renders nothing.
   */
  registerCaptchaSlot?: ReactNode;
  /**
   * False while the captcha in `registerCaptchaSlot` holds no fresh token
   * (`useTurnstileToken().isReady`); keeps Create Account disabled. Defaults to true.
   */
  registerCaptchaReady?: boolean;
}
