import { Link } from "react-router-dom";
import LoginCredentialsForm from "./LoginCredentialsForm";
import { LOGIN_FORM_DEFAULT_PASSWORD_MIN_LENGTH, LOGIN_FORM_REGISTER_LINK_COPY } from "../../constants/login-form-copy";
import type { LoginFormRegisterLinkProps } from "../../types/login-form-register-link-props";

/** LoginForm when the app has its own sign-up page: the sign-in form and a link there. */
export default function LoginFormRegisterLink({
  onSignIn,
  registerHref,
  trustCopy,
  autoFocusEmail,
}: LoginFormRegisterLinkProps) {
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
      <p className="mt-2 text-sm text-center text-muted-foreground">
        {LOGIN_FORM_REGISTER_LINK_COPY.prompt}{" "}
        <Link to={registerHref} className="inline-flex items-center min-h-[44px] text-primary hover:underline">
          {LOGIN_FORM_REGISTER_LINK_COPY.link}
        </Link>
      </p>
    </>
  );
}
