import LoginFormRegisterLink from "./LoginFormRegisterLink";
import LoginFormSignInOnly from "./LoginFormSignInOnly";
import LoginFormTabs from "./LoginFormTabs";
import {
  LOGIN_FORM_COPY,
  LOGIN_FORM_DEFAULT_PASSWORD_MIN_LENGTH,
} from "../../constants/login-form-copy";
import type { LoginFormProps } from "../../types/login-form-props";

export default function LoginForm(props: LoginFormProps) {
  const { onSignIn, onGoogleSignIn, trustCopy = LOGIN_FORM_COPY.defaultTrust, autoFocusEmail = false } = props;

  function renderCredentials() {
    if (props.signInOnly) {
      return <LoginFormSignInOnly onSignIn={onSignIn} trustCopy={trustCopy} autoFocusEmail={autoFocusEmail} />;
    }
    if (props.registerHref !== undefined) {
      return (
        <LoginFormRegisterLink
          onSignIn={onSignIn}
          registerHref={props.registerHref}
          trustCopy={trustCopy}
          autoFocusEmail={autoFocusEmail}
        />
      );
    }
    return (
      <LoginFormTabs
        onSignIn={onSignIn}
        onRegister={props.onRegister}
        defaultTab={props.defaultTab ?? "signin"}
        trustCopy={trustCopy}
        autoFocusEmail={autoFocusEmail}
        passwordMinLength={props.passwordMinLength ?? LOGIN_FORM_DEFAULT_PASSWORD_MIN_LENGTH}
        registerCaptchaSlot={props.registerCaptchaSlot}
        registerCaptchaReady={props.registerCaptchaReady ?? true}
      />
    );
  }

  return (
    <div className="w-full max-w-sm mx-auto">
      {onGoogleSignIn && (
        <>
          <button
            type="button"
            onClick={onGoogleSignIn}
            className="w-full flex items-center justify-center gap-3 border border-input rounded-md px-4 py-2.5 text-sm font-medium hover:bg-muted transition-colors min-h-[44px]"
          >
            {/* Google "G" SVG */}
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path
                d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
                fill="#4285F4"
              />
              <path
                d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"
                fill="#34A853"
              />
              <path
                d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
                fill="#FBBC05"
              />
              <path
                d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z"
                fill="#EA4335"
              />
            </svg>
            Continue with Google
          </button>
          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-background px-2 text-xs text-muted-foreground">
                or continue with email
              </span>
            </div>
          </div>
        </>
      )}

      {renderCredentials()}
    </div>
  );
}
