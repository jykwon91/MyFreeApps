import { useState } from "react";
import { Link } from "react-router-dom";
import AlertBox from "../components/ui/AlertBox";
import LoadingButton from "../components/ui/LoadingButton";
import TurnstileWidget from "../components/ui/TurnstileWidget";
import CenteredCard from "../components/layout/CenteredCard";
import { useTurnstileToken } from "../hooks/useTurnstileToken";
import { describeAuthError } from "../utils/describeAuthError";
import {
  FORGOT_PASSWORD_DEFAULT_HEADING,
  FORGOT_PASSWORD_EMAIL_REQUIRED,
} from "../constants/forgot-password-copy";
import type { ForgotPasswordPageProps } from "../types/forgot-password-page-props";

const ERROR_ID = "forgot-password-error";

/**
 * The signed-out "forgot password" page every app shares. The user types their
 * email; the app's `onRequestReset` posts it to /auth/forgot-password.
 *
 * Only a request the server accepted shows "Check your inbox", and that copy
 * never says whether the address is registered: the backend answers 202 for
 * every address, so a failure here is never "no such account". A failure
 * (rate limit, captcha refusal, 5xx, network) shows its reason, keeps the typed
 * email and re-challenges Turnstile, whose token the server may already have
 * spent, so the user can retry instead of waiting for an email that isn't coming.
 */
export default function ForgotPasswordPage({
  onRequestReset,
  heading = FORGOT_PASSWORD_DEFAULT_HEADING,
  icon,
  loginPath = "/login",
}: ForgotPasswordPageProps) {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const turnstile = useTurnstileToken();

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const trimmed = email.trim();
    if (!trimmed) {
      setError(FORGOT_PASSWORD_EMAIL_REQUIRED);
      return;
    }
    setIsLoading(true);
    try {
      await onRequestReset(trimmed, turnstile.token);
      setSubmitted(true);
    } catch (err: unknown) {
      setError(describeAuthError(err));
      turnstile.reset();
    } finally {
      setIsLoading(false);
    }
  }

  if (submitted) {
    return (
      <CenteredCard title="Check your inbox">
        <p className="text-sm text-muted-foreground mb-6">
          If an account exists for <strong>{email}</strong>, we've sent a
          password reset link. Check your inbox and spam folder.
        </p>
        <Link to={loginPath} className="text-sm text-primary hover:underline">
          Back to sign in
        </Link>
      </CenteredCard>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-muted">
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="bg-card border rounded-lg p-8 w-full max-w-sm shadow-sm">
          <div className="flex items-center gap-2 mb-6">
            {icon}
            <h1 className="text-2xl font-semibold">{heading}</h1>
          </div>
          <p className="text-sm text-muted-foreground mb-6">
            Enter your account email and we'll send you a link to reset your password.
          </p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="forgot-email" className="block text-sm font-medium mb-1">
                Email
              </label>
              <input
                id="forgot-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                required
                disabled={isLoading}
                autoComplete="email"
                aria-describedby={error ? ERROR_ID : undefined}
              />
            </div>
            <TurnstileWidget {...turnstile.widgetProps} />
            {error ? (
              <AlertBox variant="error">
                <span id={ERROR_ID} role="alert">
                  {error}
                </span>
              </AlertBox>
            ) : null}
            <LoadingButton
              type="submit"
              isLoading={isLoading}
              loadingText="Sending..."
              className="w-full"
              disabled={!email.trim() || !turnstile.isReady}
            >
              Send reset link
            </LoadingButton>
          </form>
          <p className="text-sm text-muted-foreground text-center mt-4">
            <Link to={loginPath} className="text-primary hover:underline">
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
