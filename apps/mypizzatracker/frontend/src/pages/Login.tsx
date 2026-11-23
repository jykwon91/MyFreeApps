import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Lock } from "lucide-react";
import {
  AuthPageFooter,
  LoginForm,
  ResendStatusAlert,
  TwoFactorStep,
  isUnverifiedLoginError,
  resolveLoginDestination,
  useIsAuthenticated,
} from "@platform/ui";
import type { ResendStatus } from "@platform/ui";
import { requestVerifyToken, signIn } from "@/lib/auth";
import { LOGIN_TRUST_COPY } from "@/constants/loginCopy";

/**
 * Sign-in page for the single-user MyPizzaTracker: the shared LoginForm with
 * no sign-up (the operator account is seeded from env vars at boot), then the
 * shared TwoFactorStep when the account has 2FA, and a resend offer when the
 * email isn't verified yet.
 *
 * After signing in the operator goes back to where they were headed: the page
 * RequireAuth sent them from, else the `returnTo` query parameter, else home.
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

  const destination = resolveLoginDestination(location.state, searchParams.get("returnTo"), "/");

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
          <Lock className="w-6 h-6 text-primary-foreground" aria-hidden />
        </div>
        <h1 className="text-xl font-semibold tracking-tight">MyPizzaTracker</h1>
      </div>

      <div className="w-full max-w-sm bg-background border rounded-xl p-8 shadow-xs">
        {pendingCredentials ? (
          <TwoFactorStep onVerify={onVerifyTotp} onBack={() => setPendingCredentials(null)} />
        ) : (
          <>
            <LoginForm
              onSignIn={onSignIn}
              signInOnly
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

      <AuthPageFooter appName="MyPizzaTracker" />
    </div>
  );
}
