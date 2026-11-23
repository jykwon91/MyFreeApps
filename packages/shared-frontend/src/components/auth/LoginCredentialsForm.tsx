import { useState } from "react";
import AlertBox from "../ui/AlertBox";
import LoadingButton from "../ui/LoadingButton";
import LoginEmailField from "./LoginEmailField";
import LoginPasswordField from "./LoginPasswordField";
import { describeAuthError } from "../../utils/describeAuthError";
import { LOGIN_FORM_COPY } from "../../constants/login-form-copy";
import type { LoginCredentialsFormProps } from "../../types/login-credentials-form-props";

const PASSWORD_HELPER_ID = "login-password-helper";
const ERROR_ID = "login-error";

/** LoginForm's email and password form, for signing in or for creating an account. */
export default function LoginCredentialsForm({
  mode,
  onSubmit,
  trustCopy,
  autoFocusEmail,
  passwordMinLength,
  captchaSlot,
  captchaReady,
}: LoginCredentialsFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isRegister = mode === "register";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      await onSubmit(email, password);
    } catch (err: unknown) {
      setError(describeAuthError(err));
    } finally {
      setIsLoading(false);
    }
  }

  const canSubmit = isRegister
    ? password.length >= passwordMinLength && captchaReady
    : email !== "" && password !== "";

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <LoginEmailField value={email} onChange={setEmail} disabled={isLoading} autoFocus={autoFocusEmail} />
      <LoginPasswordField
        value={password}
        onChange={setPassword}
        show={showPassword}
        onToggleShow={() => setShowPassword((v) => !v)}
        autoComplete={isRegister ? "new-password" : "current-password"}
        disabled={isLoading}
        helperId={PASSWORD_HELPER_ID}
        minLength={isRegister ? passwordMinLength : undefined}
      />
      <p className="text-xs text-muted-foreground">{trustCopy}</p>
      {isRegister && captchaSlot ? <div data-testid="register-captcha-slot">{captchaSlot}</div> : null}
      {error && (
        <AlertBox variant="error" className="text-sm">
          <span id={ERROR_ID} role="alert">
            {error}
          </span>
        </AlertBox>
      )}
      <LoadingButton
        type="submit"
        variant="primary"
        isLoading={isLoading}
        loadingText={isRegister ? LOGIN_FORM_COPY.creatingAccount : LOGIN_FORM_COPY.signingIn}
        disabled={!canSubmit}
        className="w-full"
      >
        {isRegister ? LOGIN_FORM_COPY.createAccount : LOGIN_FORM_COPY.signIn}
      </LoadingButton>
    </form>
  );
}
