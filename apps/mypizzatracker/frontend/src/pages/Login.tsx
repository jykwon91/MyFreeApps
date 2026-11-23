import { useEffect, useState } from "react";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { Lock } from "lucide-react";
import {
  AuthPageFooter,
  LoadingButton,
  ResendStatusAlert,
  TwoFactorStep,
  describeAuthError,
  isUnverifiedLoginError,
  resolveLoginDestination,
  useIsAuthenticated,
} from "@platform/ui";
import type { ResendStatus } from "@platform/ui";
import { requestVerifyToken, signIn } from "@/lib/auth";

/**
 * Login page for the single-user MyPizzaTracker.
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
  const [searchParams] = useSearchParams();
  const isAuthenticated = useIsAuthenticated();

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

  const destination = resolveLoginDestination(location.state, searchParams.get("returnTo"), "/");

  useEffect(() => {
    if (isAuthenticated) navigate(destination, { replace: true });
  }, [isAuthenticated, navigate, destination]);

  function navigateAfterLogin(): void {
    navigate(destination, { replace: true });
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
        return;
      }
      navigateAfterLogin();
    } catch (err) {
      if (isUnverifiedLoginError(err)) {
        setPendingEmail(email);
        setNeedsVerification(true);
        setResendStatus("idle");
      } else {
        setError(describeAuthError(err));
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

  async function onVerifyTotp(code: string): Promise<boolean> {
    if (!pendingCredentials) return false;
    const result = await signIn(pendingCredentials.email, pendingCredentials.password, code);
    if (result.status !== "ok") return false;
    navigateAfterLogin();
    return true;
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-muted/30 px-4">
      <div className="mb-8 flex flex-col items-center gap-2">
        <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center">
          <Lock className="w-6 h-6 text-primary-foreground" aria-hidden />
        </div>
        <span className="text-xl font-semibold tracking-tight">MyPizzaTracker</span>
      </div>

      <div className="w-full max-w-sm bg-background border rounded-xl p-8 shadow-xs">
        {pendingCredentials ? (
          <TwoFactorStep onVerify={onVerifyTotp} onBack={() => setPendingCredentials(null)} />
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
                <ResendStatusAlert status={resendStatus} onResend={onResendVerification} />
              </div>
            ) : null}
          </>
        )}
      </div>

      <AuthPageFooter appName="MyPizzaTracker" />
    </div>
  );
}
