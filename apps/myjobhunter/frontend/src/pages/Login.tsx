import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { LoginForm, useIsAuthenticated, LoadingButton } from "@platform/ui";
import { isUnverifiedError, useSignIn } from "@/features/auth/useSignIn";
import { requestVerifyToken } from "@/lib/auth";

interface LocationState {
  from?: string;
}

type ResendStatus = "idle" | "sending" | "sent" | "error";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const isAuthenticated = useIsAuthenticated();
  const { handleSignIn, handleRegister } = useSignIn();

  const [needsVerification, setNeedsVerification] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");
  const [registeredEmail, setRegisteredEmail] = useState("");
  const [resendStatus, setResendStatus] = useState<ResendStatus>("idle");

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      const state = location.state as LocationState | null;
      navigate(state?.from ?? "/dashboard", { replace: true });
    }
  }, [isAuthenticated, navigate, location.state]);

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
  }

  async function onRegister(email: string, password: string): Promise<void> {
    await handleRegister(email, password);
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

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-muted/30 px-4">
      {/* App logo */}
      <div className="mb-8 flex flex-col items-center gap-2">
        <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center">
          <span className="text-primary-foreground font-bold text-xl">J</span>
        </div>
        <span className="text-xl font-semibold tracking-tight">MyJobHunter</span>
      </div>

      {/* Login card */}
      <div className="w-full max-w-sm bg-background border rounded-xl p-8 shadow-xs">
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
      </div>

      {/* Footer */}
      <p className="mt-8 text-xs text-muted-foreground">&copy; 2026 MyJobHunter</p>
    </div>
  );
}
