import type { ReactNode } from "react";
import type { LoginFormMode } from "./login-form-mode";

export interface LoginFormTabsProps {
  onSignIn: (email: string, password: string) => Promise<void>;
  onRegister: (email: string, password: string) => Promise<void>;
  defaultTab: LoginFormMode;
  trustCopy: string;
  autoFocusEmail: boolean;
  passwordMinLength: number;
  registerCaptchaSlot?: ReactNode;
  registerCaptchaReady: boolean;
}
