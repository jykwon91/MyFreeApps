import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Languages } from "lucide-react";
import {
  AuthPageFooter,
  LoginForm,
  ResendStatusAlert,
  TwoFactorStep,
  isUnverifiedLoginError,
  safeReturnPath,
  useIsAuthenticated,
  withReturnTo,
} from "@platform/ui";
import type { RequireAuthLocationState, ResendStatus } from "@platform/ui";
import { requestVerifyToken, signIn } from "@/lib/auth";
import { LOGIN_TRUST_COPY } from "@/constants/loginCopy";

/**
 * Sign-in page, wired the way MyJobHunter's is: the shared LoginForm, then the
 * shared TwoFactorStep when the account has 2FA, and a resend offer when the
 * email isn't verified yet. Sign-up stays on /register (display name and the
 * terms checkbox), so LoginForm links there rather than showing a tab.
 *
 * After signing in the learner goes back to where they were headed: the page
 * RequireAuth sent them from, else the `returnTo` that /register's sign-in
 * link carries, else home. The register link carries that destination on, so
 * signing up and then in still ends there.
 */
export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const isAuthenticated = useIsAuthenticated();

  const [needsVerification, setNeedsVerification] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");
  const [resendStatus, setResendStatus] = useState<ResendStatus>("idle");

  const [pendingCredentials, setPendingCredentials] = useState<
    { email: string; password: string } | null
  >(null);

  const destination =
    safeReturnPath((location.state as RequireAuthLocationState | null)?.from) ??
    safeReturnPath(searchParams.get("returnTo")) ??
    "/";
  const registerHref = withReturnTo("/register", destination === "/" ? null : destination);

  useEffect(() => {
    if (isAuthenticated) navigate(destination, { replace: true });
  }, [isAuthenticated, navigate, destination]);

  async function onSignIn(email: string, password: string): Promise<void> {
    setNeedsVerification(false);
    try {
      const result = await signIn(email, password);
      if (result.status === "totp_required") {
        setPendingCredentials({ email, password });
        return;
      }
      navigate(destination, { replace: true });
    } catch (err) {
      if (!isUnverifiedLoginError(err)) throw err;
      // The resend banner says it; rethrowing would make LoginForm say it again.
      setPendingEmail(email);
      setNeedsVerification(true);
      setResendStatus("idle");
    }
  }

  async function onResendVerification(): Promise<void> {
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
    navigate(destination, { replace: true });
    return true;
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-muted/30 px-4">
      <div className="mb-8 flex flex-col items-center gap-2">
        <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center">
          <Languages className="w-6 h-6 text-primary-foreground" aria-hidden />
        </div>
        <h1 className="text-xl font-semibold tracking-tight">MyLanguageTutor</h1>
      </div>

      <div className="w-full max-w-sm bg-background border rounded-xl p-8 shadow-xs">
        {pendingCredentials ? (
          <TwoFactorStep onVerify={onVerifyTotp} onBack={() => setPendingCredentials(null)} />
        ) : (
          <>
            <LoginForm
              onSignIn={onSignIn}
              registerHref={registerHref}
              trustCopy={LOGIN_TRUST_COPY}
              autoFocusEmail
            />

            <p className="mt-4 text-sm text-center text-muted-foreground">
              <Link
                to="/forgot-password"
                className="inline-flex items-center min-h-[44px] text-primary hover:underline"
              >
                Forgot password?
              </Link>
            </p>

            {needsVerification ? (
              <div
                data-testid="resend-verification-banner"
                className="mt-6 space-y-2 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm"
              >
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

      <AuthPageFooter appName="MyLanguageTutor" />
    </div>
  );
}
