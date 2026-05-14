import { useCallback, useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Lock } from "lucide-react";
import {
  LoadingButton,
  extractErrorMessage,
  useIsAuthenticated,
} from "@platform/ui";
import { isUnverifiedError, useSignIn } from "@/features/auth/useSignIn";
import { requestVerifyToken } from "@/lib/auth";

interface LocationState {
  from?: string;
}

type ResendStatus = "idle" | "sending" | "sent" | "error";

/**
 * Login page for the single-user __APP_DISPLAY_NAME__.
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
  const { handleSignIn } = useSignIn();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const [needsVerification, setNeedsVerification] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");
  const [resendStatus, setResendStatus] = useState<ResendStatus>("idle");

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
      navigate(state?.from ?? "/", { replace: true });
    }
  }, [isAuthenticated, navigate, location.state]);

  function navigateAfterLogin(): void {
    const state = location.state as LocationState | null;
    navigate(state?.from ?? "/", { replace: true });
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError("");
    setNeedsVerification(false);
    setIsLoading(true);
    try {
      const result = await handleSignIn(email, password);
      if (result.status === "totp_required") {
        setPendingCredentials({ email, password });
        setTotpCode("");
        setTotpError("");
        return;
      }
      navigateAfterLogin();
    } catch (err) {
      if (isUnverifiedError(err)) {
        setPendingEmail(email);
        setNeedsVerification(true);
        setResendStatus("idle");
      } else {
        setError("Incorrect email or password. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
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
        setTotpError("Authentication code didn't go through. Please try again.");
      }
    } catch (err) {
      const detail = extractErrorMessage(err);
      setTotpError(
        detail === "invalid_totp"
          ? "Invalid authentication code. Please try again."
          : detail,
      );
    } finally {
      setIsVerifyingTotp(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-muted/30 px-4">
      <div className="mb-8 flex flex-col items-center gap-2">
        <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center">
          <Lock className="w-6 h-6 text-primary-foreground" aria-hidden />
        </div>
        <span className="text-xl font-semibold tracking-tight">__APP_DISPLAY_NAME__</span>
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

            <p className="mt-4 text-sm text-center text-muted-foreground">
              <a href="/forgot-password" className="text-primary hover:underline">
                Forgot password?
              </a>
            </p>

            {needsVerification ? (
              <div className="mt-6 space-y-2 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm">
                <p className="text-amber-900">
                  Please verify your email before signing in. Check your inbox for the
                  verification link.
                </p>
                {resendStatus === "sent" ? (
                  <p className="text-emerald-700">
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
          </>
        )}
      </div>

      <p className="mt-8 text-xs text-muted-foreground">&copy; 2026 __APP_DISPLAY_NAME__</p>
    </div>
  );
}
