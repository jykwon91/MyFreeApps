import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { login } from "@/shared/lib/auth";
import api from "@/shared/lib/api";
import { extractErrorMessage } from "@/shared/utils/errorMessage";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import LegalFooter from "@/app/components/LegalFooter";

const LOCKOUT_COOLDOWN_SECONDS = 30;

function isLockoutResponse(err: unknown): boolean {
  if (typeof err === "object" && err !== null) {
    const obj = err as Record<string, unknown>;
    if (obj.status === 429) return true;
    if (typeof obj.data === "object" && obj.data !== null) {
      const data = obj.data as Record<string, unknown>;
      if (typeof data.detail === "string" && data.detail.toLowerCase().includes("too many")) return true;
    }
  }
  return false;
}

function isUnverifiedResponse(err: unknown): boolean {
  if (typeof err === "object" && err !== null) {
    const obj = err as Record<string, unknown>;
    if (typeof obj.data === "object" && obj.data !== null) {
      const data = obj.data as Record<string, unknown>;
      if (data.detail === "LOGIN_USER_NOT_VERIFIED") return true;
    }
  }
  return false;
}

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get("returnTo");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [needsTotp, setNeedsTotp] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [resendStatus, setResendStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

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
      const result = await login(
        email.trim(),
        password,
        needsTotp ? totpCode : undefined,
      );

      if (result.detail === "totp_required") {
        setNeedsTotp(true);
        setIsLoading(false);
        return;
      }

      navigate(returnTo ?? "/");
    } catch (err) {
      if (isLockoutResponse(err)) {
        setError("Too many sign-in attempts. Try again in a few minutes.");
        startCooldown();
      } else if (isUnverifiedResponse(err)) {
        setNeedsVerification(true);
        setResendStatus("idle");
      } else {
        setError(needsTotp ? extractErrorMessage(err) : "Invalid email or password");
      }
      setIsLoading(false);
    }
  }

  async function handleResendVerification() {
    setResendStatus("sending");
    try {
      await api.post("/auth/request-verify-token", { email: email.trim() });
      setResendStatus("sent");
    } catch {
      setResendStatus("error");
    }
  }

  const isSubmitDisabled = isLoading || cooldownSeconds > 0;

  const registerUrl = returnTo
    ? `/register?returnTo=${encodeURIComponent(returnTo)}`
    : "/register";

  return (
    <div className="min-h-screen flex flex-col bg-muted">
      <div className="flex-1 flex items-center justify-center">
      <div className="bg-card border rounded-lg p-8 w-full max-w-sm shadow-sm">
        <h1 className="text-2xl font-semibold mb-6">MyBookkeeper</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          {!needsTotp ? (
            <>
              <div>
                <label className="block text-sm font-medium mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                  disabled={isSubmitDisabled}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                  disabled={isSubmitDisabled}
                />
              </div>
            </>
          ) : (
            <div>
              <label className="block text-sm font-medium mb-1">Authentication code</label>
              <p className="text-xs text-muted-foreground mb-2">Enter the 6-digit code from your authenticator app, or a recovery code.</p>
              <input
                type="text"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/[^A-Za-z0-9]/g, "").slice(0, 8))}
                className="w-full border rounded-md px-3 py-2 text-sm font-mono text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="000000"
                maxLength={8}
                autoFocus
              />
            </div>
          )}
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
          {needsVerification ? (
            <div className="space-y-2">
              <p className="text-sm text-amber-700 dark:text-amber-400">
                Please verify your email before signing in. Check your inbox for the verification link.
              </p>
              {resendStatus === "sent" ? (
                <p className="text-sm text-green-700 dark:text-green-400">Verification email sent. Check your inbox.</p>
              ) : resendStatus === "error" ? (
                <p className="text-sm text-destructive">Failed to resend. Try again shortly.</p>
              ) : (
                <LoadingButton
                  type="button"
                  isLoading={resendStatus === "sending"}
                  loadingText="Sending..."
                  className="w-full"
                  onClick={handleResendVerification}
                >
                  Resend verification email
                </LoadingButton>
              )}
            </div>
          ) : null}
          <LoadingButton
            type="submit"
            isLoading={isLoading}
            loadingText="Signing in..."
            className="w-full"
            disabled={isSubmitDisabled}
          >
            {cooldownSeconds > 0
              ? `Try again in ${cooldownSeconds}s`
              : needsTotp
                ? "Verify"
                : "Sign in"}
          </LoadingButton>
          {needsTotp ? (
            <button
              type="button"
              onClick={() => { setNeedsTotp(false); setTotpCode(""); setError(""); }}
              className="w-full text-sm text-muted-foreground hover:underline"
            >
              Back to login
            </button>
          ) : null}
        </form>
        {!needsTotp ? (
          <div className="text-sm text-muted-foreground text-center mt-4 space-y-2">
            <p>
              <Link to="/forgot-password" className="text-primary hover:underline">Forgot password?</Link>
            </p>
            <p>
              Don't have an account?{" "}
              <Link to={registerUrl} className="text-primary hover:underline">Sign up</Link>
            </p>
          </div>
        ) : null}
      </div>
      </div>
      <LegalFooter />
    </div>
  );
}
