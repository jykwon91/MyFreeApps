import { useEffect, useId, useRef, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { requestVerifyToken } from "@platform/core/auth/requestVerifyToken";
import { login } from "@/shared/lib/auth";
import {
  AuthPageFooter,
  describeAuthError,
  isRateLimitedError,
  isUnverifiedLoginError,
  LoadingButton,
  ResendStatusAlert,
  TwoFactorStep,
  safeReturnPath,
  withReturnTo,
} from "@platform/ui";
import type { ResendStatus } from "@platform/ui";
import LegalFooter from "@/app/components/LegalFooter";

const LOCKOUT_COOLDOWN_SECONDS = 30;
const RATE_LIMITED_MESSAGE = "Too many sign-in attempts. Try again in a few minutes.";

interface PendingCredentials {
  email: string;
  password: string;
}

export default function Login() {
  const uid = useId();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = safeReturnPath(searchParams.get("returnTo"));

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pendingCredentials, setPendingCredentials] = useState<PendingCredentials | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [resendStatus, setResendStatus] = useState<ResendStatus>("idle");

  useEffect(() => {
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, []);

  function startCooldown() {
    setCooldownSeconds(LOCKOUT_COOLDOWN_SECONDS);
    cooldownRef.current = setInterval(() => {
      setCooldownSeconds((s) => {
        if (s <= 1) {
          clearInterval(cooldownRef.current!);
          cooldownRef.current = null;
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNeedsVerification(false);

    if (!email.trim() || !password) {
      setError("Email and password are required");
      return;
    }

    setIsLoading(true);

    try {
      const result = await login(email.trim(), password);

      if (result.detail === "totp_required") {
        setPendingCredentials({ email: email.trim(), password });
        setIsLoading(false);
        return;
      }

      navigate(returnTo ?? "/");
    } catch (err) {
      if (isRateLimitedError(err)) {
        setError(RATE_LIMITED_MESSAGE);
        startCooldown();
      } else if (isUnverifiedLoginError(err)) {
        setNeedsVerification(true);
        setResendStatus("idle");
      } else {
        setError(describeAuthError(err));
      }
      setIsLoading(false);
    }
  }

  async function handleVerifyTotp(code: string): Promise<boolean> {
    if (!pendingCredentials) return false;
    try {
      const result = await login(pendingCredentials.email, pendingCredentials.password, code);
      if (result.detail === "totp_required") return false;
    } catch (err) {
      if (isRateLimitedError(err)) throw Object.assign(new Error(RATE_LIMITED_MESSAGE), { cause: err });
      throw err;
    }
    navigate(returnTo ?? "/");
    return true;
  }

  async function handleResendVerification() {
    setResendStatus("sending");
    try {
      await requestVerifyToken(email.trim());
      setResendStatus("sent");
    } catch {
      setResendStatus("error");
    }
  }

  const isSubmitDisabled = isLoading || cooldownSeconds > 0;

  const registerUrl = withReturnTo("/register", returnTo);

  return (
    <div className="min-h-screen flex flex-col bg-muted">
      <div className="flex-1 flex items-center justify-center">
      <div className="bg-card border rounded-lg p-8 w-full max-w-sm shadow-sm">
        <h1 className="text-2xl font-semibold mb-6">MyBookkeeper</h1>
        {pendingCredentials ? (
          <TwoFactorStep onVerify={handleVerifyTotp} onBack={() => setPendingCredentials(null)} />
        ) : (
          <>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor={`${uid}-email`} className="block text-sm font-medium mb-1">Email</label>
                <input
                  id={`${uid}-email`}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                  disabled={isSubmitDisabled}
                />
              </div>
              <div>
                <label htmlFor={`${uid}-password`} className="block text-sm font-medium mb-1">Password</label>
                <input
                  id={`${uid}-password`}
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                  disabled={isSubmitDisabled}
                />
              </div>
              {error ? <p className="text-destructive text-sm">{error}</p> : null}
              {needsVerification ? (
                <div className="space-y-2">
                  <p className="text-sm text-amber-700 dark:text-amber-400">
                    Please verify your email before signing in. Check your inbox for the verification link.
                  </p>
                  <ResendStatusAlert status={resendStatus} onResend={handleResendVerification} />
                </div>
              ) : null}
              <LoadingButton
                type="submit"
                isLoading={isLoading}
                loadingText="Signing in..."
                className="w-full"
                disabled={isSubmitDisabled}
              >
                {cooldownSeconds > 0 ? `Try again in ${cooldownSeconds}s` : "Sign in"}
              </LoadingButton>
            </form>
            <div className="text-sm text-muted-foreground text-center mt-4 space-y-2">
              <p>
                <Link to="/forgot-password" className="text-primary hover:underline">Forgot password?</Link>
              </p>
              <p>
                Don't have an account?{" "}
                <Link to={registerUrl} className="text-primary hover:underline">Sign up</Link>
              </p>
            </div>
          </>
        )}
      </div>
      </div>
      <AuthPageFooter appName="MyBookkeeper" />
      <LegalFooter />
    </div>
  );
}
