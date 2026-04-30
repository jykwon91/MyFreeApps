import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
<<<<<<< HEAD
import { LoginForm, useIsAuthenticated, LoadingButton } from "@platform/ui";
import { isUnverifiedError, useSignIn } from "@/features/auth/useSignIn";
import { requestVerifyToken } from "@/lib/auth";
=======
import {
  LoginForm,
  LoadingButton,
  extractErrorMessage,
  useIsAuthenticated,
} from "@platform/ui";
import { useSignIn } from "@/features/auth/useSignIn";
>>>>>>> origin/main

interface LocationState {
  from?: string;
}

<<<<<<< HEAD
type ResendStatus = "idle" | "sending" | "sent" | "error";

=======
/**
 * Login page with two-factor challenge support.
 *
 * Flow:
 *   1. User enters email + password in `LoginForm` (or signs up — registration
 *      is single-step, no 2FA).
 *   2. `signIn` posts to `/auth/totp/login`. If the user has 2FA enabled,
 *      the response is `{ status: "totp_required" }` — we hide LoginForm and
 *      render the inline TOTP challenge step. The challenge accepts both
 *      6-digit TOTP codes and 8-char alphanumeric recovery codes; the
 *      backend disambiguates.
 *   3. User enters the code; we re-call `signIn` with `totpCode` populated;
 *      backend issues the JWT and we navigate.
 */
>>>>>>> origin/main
export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const isAuthenticated = useIsAuthenticated();
  const { handleSignIn, handleRegister } = useSignIn();

<<<<<<< HEAD
  const [needsVerification, setNeedsVerification] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");
  const [registeredEmail, setRegisteredEmail] = useState("");
  const [resendStatus, setResendStatus] = useState<ResendStatus>("idle");

  // Redirect if already authenticated
=======
  // TOTP challenge state — populated after the first signIn returns
  // `{ status: "totp_required" }`. We retain the original email + password
  // so the second submit can re-issue the same login with `totpCode`.
  const [pendingCredentials, setPendingCredentials] = useState<
    { email: string; password: string } | null
  >(null);
  const [totpCode, setTotpCode] = useState("");
  const [totpError, setTotpError] = useState("");
  const [isVerifyingTotp, setIsVerifyingTotp] = useState(false);

  // Redirect if already authenticated (e.g. opened /login while signed in).
>>>>>>> origin/main
  useEffect(() => {
    if (isAuthenticated) {
      const state = location.state as LocationState | null;
      navigate(state?.from ?? "/dashboard", { replace: true });
    }
  }, [isAuthenticated, navigate, location.state]);

<<<<<<< HEAD
  async function onSignIn(email: string, password: string): Promise<void> {
    setNeedsVerification(false);
    setRegisteredEmail("");
    try {
      await handleSignIn(email, password);
      const state = location.state as LocationState | null;
      navigate(state?.from ?? "/dashboard", { replace: true });
    } catch (err) {
      if (isUnverifiedError(err)) {
        setPendingEmail(email);
        setNeedsVerification(true);
        setResendStatus("idle");
      }
      // Re-throw so LoginForm can show its inline error AlertBox; the
      // useSignIn hook already suppressed the toast for the unverified case.
      throw err;
    }
=======
  function navigateAfterLogin(): void {
    const state = location.state as LocationState | null;
    navigate(state?.from ?? "/dashboard", { replace: true });
>>>>>>> origin/main
  }

  async function onSignIn(email: string, password: string): Promise<void> {
    const result = await handleSignIn(email, password);
    if (result.status === "totp_required") {
      // Switch to the TOTP challenge step. LoginForm caught no error so its
      // inline error state is already clean; we own the challenge UI from here.
      setPendingCredentials({ email, password });
      setTotpCode("");
      setTotpError("");
      return;
    }
    navigateAfterLogin();
  }

  async function onRegister(email: string, password: string): Promise<void> {
    await handleRegister(email, password);
<<<<<<< HEAD
    setRegisteredEmail(email);
    setNeedsVerification(false);
  }

  async function onResendVerification() {
    if (!pendingEmail) return;
    setResendStatus("sending");
    try {
      await requestVerifyToken(pendingEmail);
      setResendStatus("sent");
    } catch {
      setResendStatus("error");
    }
=======
    navigate("/dashboard", { replace: true });
>>>>>>> origin/main
  }

  async function onTotpSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!pendingCredentials || totpCode.length < 6) return;

    setTotpError("");
    setIsVerifyingTotp(true);
    try {
      const result = await handleSignIn(
        pendingCredentials.email,
        pendingCredentials.password,
        totpCode,
      );
      if (result.status === "ok") {
        navigateAfterLogin();
      } else {
        // Server responded with totp_required again — shouldn't happen since
        // we just provided a code; surface a defensive error.
        setTotpError("Authentication code didn't go through. Please try again.");
      }
    } catch (err) {
      setTotpError(extractErrorMessage(err));
    } finally {
      setIsVerifyingTotp(false);
    }
  }

  function handleTotpBack(): void {
    setPendingCredentials(null);
    setTotpCode("");
    setTotpError("");
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-muted/30 px-4">
      {/* App logo */}
      <div className="mb-8 flex flex-col items-center gap-2">
        <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center">
          <span className="text-primary-foreground font-bold text-xl">J</span>
        </div>
        <span className="text-xl font-semibold tracking-tight">MyJobHunter</span>
      </div>

      {/* Login card — swaps between email/password (LoginForm) and TOTP challenge */}
      <div className="w-full max-w-sm bg-background border rounded-xl p-8 shadow-xs">
<<<<<<< HEAD
        {registeredEmail ? (
          <div
            data-testid="registration-success-banner"
            className="mb-6 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"
          >
            <p className="font-medium">Check your inbox</p>
            <p className="mt-1">
              We sent a verification link to{" "}
              <span className="font-medium">{registeredEmail}</span>. Click it to
              activate your account, then sign in.
            </p>
          </div>
        ) : null}

        <LoginForm
          onSignIn={onSignIn}
          onRegister={onRegister}
          trustCopy="Your job search data stays private. No recruiter access, no data resale, ever."
          passwordMinLength={12}
        />

        {needsVerification ? (
          <div
            data-testid="resend-verification-banner"
            className="mt-6 space-y-2 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm"
          >
            <p className="text-amber-900">
              Please verify your email before signing in. Check your inbox for the
              verification link.
            </p>
            {resendStatus === "sent" ? (
              <p
                className="text-emerald-700"
                data-testid="resend-verification-sent"
              >
                Verification email sent. Check your inbox.
              </p>
            ) : resendStatus === "error" ? (
              <p className="text-destructive">
                Couldn't resend right now. Try again shortly.
              </p>
            ) : (
              <LoadingButton
                type="button"
                isLoading={resendStatus === "sending"}
                loadingText="Sending..."
                className="w-full"
                onClick={onResendVerification}
              >
                Resend verification email
              </LoadingButton>
            )}
          </div>
        ) : null}
=======
        {pendingCredentials ? (
          <form onSubmit={onTotpSubmit} className="space-y-4">
            <div>
              <label htmlFor="totp-code" className="block text-sm font-medium mb-1">
                Authentication code
              </label>
              <p className="text-xs text-muted-foreground mb-2">
                Enter the 6-digit code from your authenticator app, or a recovery code.
              </p>
              <input
                id="totp-code"
                type="text"
                inputMode="text"
                autoComplete="one-time-code"
                value={totpCode}
                onChange={(e) =>
                  setTotpCode(
                    e.target.value.replace(/[^A-Za-z0-9]/g, "").slice(0, 8),
                  )
                }
                className="w-full border rounded-md px-3 py-2 text-sm font-mono text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
                placeholder="000000"
                maxLength={8}
                autoFocus
              />
            </div>
            {totpError ? (
              <p className="text-destructive text-sm" role="alert">
                {totpError}
              </p>
            ) : null}
            <LoadingButton
              type="submit"
              isLoading={isVerifyingTotp}
              loadingText="Verifying..."
              className="w-full"
              disabled={totpCode.length < 6}
            >
              Verify
            </LoadingButton>
            <button
              type="button"
              onClick={handleTotpBack}
              className="w-full text-sm text-muted-foreground hover:underline min-h-[44px]"
            >
              Back to login
            </button>
          </form>
        ) : (
          <LoginForm
            onSignIn={onSignIn}
            onRegister={onRegister}
            trustCopy="Your job search data stays private. No recruiter access, no data resale, ever."
            passwordMinLength={12}
          />
        )}
>>>>>>> origin/main
      </div>

      {/* Footer */}
      <p className="mt-8 text-xs text-muted-foreground">&copy; 2026 MyJobHunter</p>
    </div>
  );
}
