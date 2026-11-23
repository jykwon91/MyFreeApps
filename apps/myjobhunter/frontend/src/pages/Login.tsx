import { useEffect, useState } from "react";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { Briefcase } from "lucide-react";
import {
  AuthPageFooter,
  LoginForm,
  TurnstileWidget,
  TwoFactorStep,
  useTurnstileToken,
  isUnverifiedLoginError,
  resolveLoginDestination,
  useIsAuthenticated,
  ResendStatusAlert,
} from "@platform/ui";
import type { ResendStatus } from "@platform/ui";
import { register, requestVerifyToken, signIn } from "@/lib/auth";

/**
 * Login page with three layered flows:
 *
 *   1. **Email verification (PR C4)** — when login returns
 *      `LOGIN_USER_NOT_VERIFIED`, surface a "Resend verification email" CTA.
 *   2. **TOTP challenge (PR C5)** — when `signIn` returns
 *      `{ status: "totp_required" }`, hide LoginForm and render the shared
 *      TwoFactorStep (accepts both 6-digit codes and recovery codes).
 *   3. **Registration confirmation (PR C4)** — after register, show
 *      "check your inbox" banner instead of auto-signing-in.
 */
export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const isAuthenticated = useIsAuthenticated();

  // Email-verification state (C4)
  const [needsVerification, setNeedsVerification] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");
  const [registeredEmail, setRegisteredEmail] = useState("");
  const [resendStatus, setResendStatus] = useState<ResendStatus>("idle");

  // TOTP challenge state (C5) — populated after first signIn returns totp_required
  const [pendingCredentials, setPendingCredentials] = useState<
    { email: string; password: string } | null
  >(null);

  // Turnstile token captured from the widget on the register tab.
  // Submitted to the backend as the X-Turnstile-Token header during
  // registration. Empty until the user solves the CAPTCHA. The widget
  // renders nothing when VITE_TURNSTILE_SITE_KEY is unset (dev/CI),
  // and registration proceeds without the header — backend's
  // require_turnstile dependency short-circuits in that case.
  const turnstile = useTurnstileToken();

  const destination = resolveLoginDestination(location.state, searchParams.get("returnTo"), "/dashboard");

  useEffect(() => {
    if (isAuthenticated) navigate(destination, { replace: true });
  }, [isAuthenticated, navigate, destination]);

  function navigateAfterLogin(): void {
    navigate(destination, { replace: true });
  }

  async function onSignIn(email: string, password: string): Promise<void> {
    setNeedsVerification(false);
    setRegisteredEmail("");
    try {
      const result = await signIn(email, password);
      if (result.status === "totp_required") {
        setPendingCredentials({ email, password });
        return;
      }
      navigateAfterLogin();
    } catch (err) {
      if (!isUnverifiedLoginError(err)) throw err;
      // The resend banner says it; rethrowing would make LoginForm say it again.
      setPendingEmail(email);
      setNeedsVerification(true);
      setResendStatus("idle");
    }
  }

  async function onRegister(email: string, password: string): Promise<void> {
    try {
      await register(email, password, turnstile.token);
    } catch (err) {
      turnstile.reset();
      throw err;
    }
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
          <Briefcase className="w-6 h-6 text-primary-foreground" aria-hidden />
        </div>
        <h1 className="text-xl font-semibold tracking-tight">MyJobHunter</h1>
      </div>

      <div className="w-full max-w-sm bg-background border rounded-xl p-8 shadow-xs">
        {pendingCredentials ? (
          <TwoFactorStep onVerify={onVerifyTotp} onBack={() => setPendingCredentials(null)} />
        ) : (
          <>
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
              registerCaptchaSlot={
                <TurnstileWidget {...turnstile.widgetProps} />
              }
              registerCaptchaReady={turnstile.isReady}
            />

            <p className="mt-4 text-sm text-center text-muted-foreground">
              <a
                href="/forgot-password"
                className="text-primary hover:underline"
              >
                Forgot password?
              </a>
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
                <ResendStatusAlert
                  status={resendStatus}
                  onResend={onResendVerification}
                />
              </div>
            ) : null}
          </>
        )}
      </div>

      <AuthPageFooter appName="MyJobHunter" />
    </div>
  );
}
