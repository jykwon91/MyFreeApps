import LoginCredentialsForm from "./LoginCredentialsForm";
import { LOGIN_FORM_DEFAULT_PASSWORD_MIN_LENGTH, LOGIN_FORM_REGISTER_LINK_COPY } from "../../constants/login-form-copy";
import type { LoginFormSignInOnlyProps } from "../../types/login-form-sign-in-only-props";

/** LoginForm when the app has no sign-up: just the sign-in form. */
export default function LoginFormSignInOnly({ onSignIn, trustCopy, autoFocusEmail }: LoginFormSignInOnlyProps) {
  return (
    <>
      <h2 className="text-lg font-semibold mb-6">{LOGIN_FORM_REGISTER_LINK_COPY.heading}</h2>
      <LoginCredentialsForm
        mode="signin"
        onSubmit={onSignIn}
        trustCopy={trustCopy}
        autoFocusEmail={autoFocusEmail}
        passwordMinLength={LOGIN_FORM_DEFAULT_PASSWORD_MIN_LENGTH}
        captchaReady
      />
    </>
  );
}
