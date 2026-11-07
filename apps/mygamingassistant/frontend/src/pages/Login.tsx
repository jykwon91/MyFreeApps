import { useCallback, useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Gamepad2 } from "lucide-react";
import {
  AuthPageFooter,
  LoadingButton,
  describeAuthError,
  isUnverifiedLoginError,
  useIsAuthenticated,
} from "@platform/ui";
import { RESEND_STATUS } from "@/constants/resendStatus";
import ResendVerificationAction from "@/features/auth/ResendVerificationAction";
import { TRIAGE_PAGE_PATH } from "@/games/wow-forever/data/featureRequests/triage/triageConfig";
import { requestVerifyToken, signIn } from "@/lib/auth";
import { isServeOnly } from "@/lib/serveOnly";
import type { ResendStatus } from "@/types/auth/resendStatus";

interface LocationState {
  from?: string;
}

/** Serve-only prod has one signed-in job (triage) and no password-reset flow. */
const SERVE_ONLY = isServeOnly();
const DEFAULT_AFTER_LOGIN = SERVE_ONLY ? TRIAGE_PAGE_PATH : "/";

/**
 * Login page for the single-user MyGamingAssistant.
 *
 * No registration tab — this is a single-user app. The operator account
 * is seeded from env vars at boot time.
 *
 * Supports TOTP challenge (same flow as MJH) and email verification resend.
 * Mirrors apps/myjobhunter/frontend/src/pages/Login.tsx minus the register tab.
 */
export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const isAuthenticated = useIsAuthenticated();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const [needsVerification, setNeedsVerification] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");
  const [resendStatus, setResendStatus] = useState<ResendStatus>(RESEND_STATUS.idle);

  const [pendingCredentials, setPendingCredentials] = useState<
    { email: string; password: string } | null
  >(null);
  const [totpCode, setTotpCode] = useState("");
  const [totpError, setTotpError] = useState("");
  const [isVerifyingTotp, setIsVerifyingTotp] = useState(false);

  const handleTurnstileExpire = useCallback(() => {}, []);
  void handleTurnstileExpire;

  useEffect(() => {
    if (isAuthenticated) {
      const state = location.state as LocationState | null;
      navigate(state?.from ?? DEFAULT_AFTER_LOGIN, { replace: true });
    }
  }, [isAuthenticated, navigate, location.state]);

  function navigateAfterLogin(): void {
    const state = location.state as LocationState | null;
    navigate(state?.from ?? DEFAULT_AFTER_LOGIN, { replace: true });
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError("");
    setNeedsVerification(false);
    setIsLoading(true);
    try {
      const result = await signIn(email, password);
      if (result.status === "totp_required") {
        setPendingCredentials({ email, password });
        setTotpCode("");
        setTotpError("");
        return;
      }
      navigateAfterLogin();
    } catch (err) {
      if (isUnverifiedLoginError(err)) {
        setPendingEmail(email);
        setNeedsVerification(true);
        setResendStatus(RESEND_STATUS.idle);
      } else {
        setError(describeAuthError(err));
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function onResendVerification() {
    if (!pendingEmail) return;
    setResendStatus(RESEND_STATUS.sending);
    try {
      await requestVerifyToken(pendingEmail);
      setResendStatus(RESEND_STATUS.sent);
    } catch {
      setResendStatus(RESEND_STATUS.error);
    }
  }

  async function onTotpSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!pendingCredentials || totpCode.length < 6) return;

    setTotpError("");
    setIsVerifyingTotp(true);
    try {
      const result = await signIn(
        pendingCredentials.email,
        pendingCredentials.password,
        totpCode,
      );
      if (result.status === "ok") {
        navigateAfterLogin();
      } else {
        setTotpError("Authentication code didn't go through. Please try again.");
      }
    } catch (err) {
      setTotpError(describeAuthError(err));
    } finally {
      setIsVerifyingTotp(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-muted/30 px-4">
      <div className="mb-8 flex flex-col items-center gap-2">
        <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center">
          <Gamepad2 className="w-6 h-6 text-primary-foreground" aria-hidden />
        </div>
        <span className="text-xl font-semibold tracking-tight">MyGamingAssistant</span>
      </div>

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
              onClick={() => {
                setPendingCredentials(null);
                setTotpCode("");
                setTotpError("");
              }}
              className="w-full text-sm text-muted-foreground hover:underline min-h-[44px]"
            >
              Back to login
            </button>
          </form>
        ) : (
          <>
            <h1 className="text-lg font-semibold mb-6">Sign in</h1>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium mb-1">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
                  required
                  autoComplete="email"
                  autoFocus
                />
              </div>
              <div>
                <label htmlFor="password" className="block text-sm font-medium mb-1">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
                  required
                  autoComplete="current-password"
                />
              </div>
              {error ? (
                <p className="text-destructive text-sm" role="alert">
                  {error}
                </p>
              ) : null}
              <LoadingButton
                type="submit"
                isLoading={isLoading}
                loadingText="Signing in..."
                className="w-full"
                disabled={isLoading || !email || !password}
              >
                Sign in
              </LoadingButton>
            </form>

            {SERVE_ONLY ? null : (
              <p className="mt-4 text-sm text-center text-muted-foreground">
                <a href="/forgot-password" className="text-primary hover:underline">
                  Forgot password?
                </a>
              </p>
            )}

            {needsVerification ? (
              <div className="mt-6 space-y-2 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm">
                <p className="text-amber-900">
                  Please verify your email before signing in. Check your inbox for the
                  verification link.
                </p>
                <ResendVerificationAction status={resendStatus} onResend={onResendVerification} />
              </div>
            ) : null}
          </>
        )}
      </div>

      <AuthPageFooter appName="MyGamingAssistant" />
    </div>
  );
}
