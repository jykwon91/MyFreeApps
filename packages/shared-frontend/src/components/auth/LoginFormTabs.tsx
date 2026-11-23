import { useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import LoginCredentialsForm from "./LoginCredentialsForm";
import { LOGIN_FORM_COPY } from "../../constants/login-form-copy";
import type { LoginFormMode } from "../../types/login-form-mode";
import type { LoginFormTabsProps } from "../../types/login-form-tabs-props";

const SIGN_IN_TAB_ID = "login-tab-signin";
const REGISTER_TAB_ID = "login-tab-register";
const TRIGGER_CLASS =
  "flex-1 py-2 text-sm font-medium text-muted-foreground border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-foreground transition-colors";

/**
 * LoginForm when it signs people up itself: Sign In and Create Account tabs.
 * Only the active tab's form is mounted, so switching tabs starts it empty.
 */
export default function LoginFormTabs({
  onSignIn,
  onRegister,
  defaultTab,
  trustCopy,
  autoFocusEmail,
  passwordMinLength,
  registerCaptchaSlot,
  registerCaptchaReady,
}: LoginFormTabsProps) {
  const [tab, setTab] = useState<LoginFormMode>(defaultTab);
  // Focus the email only on arrival: after a tab switch it belongs on the tab list.
  const [hasSwitched, setHasSwitched] = useState(false);

  function handleTabChange(value: string) {
    setTab(value as LoginFormMode);
    setHasSwitched(true);
  }

  return (
    <Tabs.Root value={tab} onValueChange={handleTabChange}>
      <Tabs.List aria-labelledby="login-tabs-heading" className="flex border-b mb-6">
        <Tabs.Trigger id={SIGN_IN_TAB_ID} value="signin" className={TRIGGER_CLASS}>
          {LOGIN_FORM_COPY.signInTab}
        </Tabs.Trigger>
        <Tabs.Trigger id={REGISTER_TAB_ID} value="register" className={TRIGGER_CLASS}>
          {LOGIN_FORM_COPY.registerTab}
        </Tabs.Trigger>
      </Tabs.List>

      <Tabs.Content value="signin" aria-labelledby={SIGN_IN_TAB_ID}>
        <LoginCredentialsForm
          mode="signin"
          onSubmit={onSignIn}
          trustCopy={trustCopy}
          autoFocusEmail={autoFocusEmail && !hasSwitched}
          passwordMinLength={passwordMinLength}
          captchaReady
        />
      </Tabs.Content>

      <Tabs.Content value="register" aria-labelledby={REGISTER_TAB_ID}>
        <LoginCredentialsForm
          mode="register"
          onSubmit={onRegister}
          trustCopy={trustCopy}
          autoFocusEmail={autoFocusEmail && !hasSwitched}
          passwordMinLength={passwordMinLength}
          captchaSlot={registerCaptchaSlot}
          captchaReady={registerCaptchaReady}
        />
      </Tabs.Content>
    </Tabs.Root>
  );
}
