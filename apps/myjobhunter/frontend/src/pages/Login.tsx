import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  LoginForm,
  LoadingButton,
  extractErrorMessage,
  useIsAuthenticated,
} from "@platform/ui";
import { useSignIn } from "@/features/auth/useSignIn";

interface LocationState {
  from?: string;
}

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
export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const isAuthenticated = useIsAuthenticated();
  const { handleSignIn, handleRegister } = useSignIn();

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
  useEffect(() => {
    if (isAuthenticated) {
      const state = location.state as LocationState | null;
      navigate(state?.from ?? "/dashboard", { replace: true });
    }
  }, [isAuthenticated, navigate, location.state]);

  function navigateAfterLogin(): void {
    const state = location.state as LocationState | null;
    navigate(state?.from ?? "/dashboard", { replace: true });
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
    navigate("/dashboard", { replace: true });
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
      </div>

      {/* Footer */}
      <p className="mt-8 text-xs text-muted-foreground">
        &copy; 2026 MyJobHunter
      </p>
    </div>
  );
}
