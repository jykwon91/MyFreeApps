import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ChefHat } from "lucide-react";
import {
  AuthPageFooter,
  LoadingButton,
  TurnstileWidget,
  useIsAuthenticated,
} from "@platform/ui";
import { register } from "@/lib/auth";
import { describeRegisterError } from "@/features/auth/registerErrorMessages";

const MIN_PASSWORD_LENGTH = 12;

/**
 * Self-serve registration page for the multi-user MyRecipes.
 *
 * Mirrors apps/mybookkeeper/frontend/src/app/pages/Register.tsx and
 * apps/myjobhunter/frontend/src/pages/Register.tsx: optional display name,
 * Turnstile widget, a required acceptance checkbox (submit disabled until
 * checked), and HIBP / weak-password reasons surfaced inline via
 * describeRegisterError. We do not auto-sign-in — the backend sends a
 * verification email and the page shows a "check your inbox" notice.
 */
export default function Register() {
  const navigate = useNavigate();
  const isAuthenticated = useIsAuthenticated();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get("returnTo");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);

  const handleTurnstileVerify = useCallback((token: string) => {
    setTurnstileToken(token);
  }, []);

  const handleTurnstileExpire = useCallback(() => {
    setTurnstileToken("");
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      navigate("/", { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const loginUrl = returnTo
    ? `/login?returnTo=${encodeURIComponent(returnTo)}`
    : "/login";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }

    setIsLoading(true);
    try {
      await register(email.trim(), password, displayName, turnstileToken);
      setRegistered(true);
    } catch (err) {
      setError(describeRegisterError(err));
    } finally {
      setIsLoading(false);
    }
  }

  if (registered) {
    return (
      <div className="min-h-screen flex flex-col bg-muted/30">
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="bg-background border rounded-xl p-8 w-full max-w-sm shadow-xs text-center">
            <h1 className="text-xl font-semibold mb-4">Check your inbox</h1>
            <p className="text-sm text-muted-foreground mb-6">
              We sent a verification link to <strong>{email}</strong>. Click the
              link in that email to activate your account, then sign in.
            </p>
            <p className="text-sm text-muted-foreground">
              Already verified?{" "}
              <Link to={loginUrl} className="text-primary hover:underline">
                Sign in
              </Link>
            </p>
          </div>
        </div>
        <AuthPageFooter appName="MyRecipes" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-muted/30">
      <div className="flex-1 flex flex-col items-center justify-center px-4">
        <div className="mb-8 flex flex-col items-center gap-2">
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center">
            <ChefHat className="w-6 h-6 text-primary-foreground" aria-hidden />
          </div>
          <span className="text-xl font-semibold tracking-tight">MyRecipes</span>
        </div>

        <div className="bg-background border rounded-xl p-8 w-full max-w-sm shadow-xs">
          <h1 className="text-lg font-semibold mb-6">Create an account</h1>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="display-name" className="block text-sm font-medium mb-1">
                Name
              </label>
              <input
                id="display-name"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Optional"
                className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
                autoComplete="name"
              />
            </div>
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
                minLength={MIN_PASSWORD_LENGTH}
                autoComplete="new-password"
              />
              <p className="text-xs text-muted-foreground mt-1">
                At least {MIN_PASSWORD_LENGTH} characters.
              </p>
            </div>
            <TurnstileWidget
              onVerify={handleTurnstileVerify}
              onExpire={handleTurnstileExpire}
            />
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border accent-primary cursor-pointer"
                data-testid="terms-checkbox"
              />
              <span className="text-sm text-muted-foreground leading-snug">
                I agree to use this service responsibly.
              </span>
            </label>
            {error ? (
              <p className="text-destructive text-sm" role="alert">
                {error}
              </p>
            ) : null}
            <LoadingButton
              type="submit"
              isLoading={isLoading}
              loadingText="Creating account..."
              className="w-full"
              disabled={
                isLoading ||
                !termsAccepted ||
                !email ||
                password.length < MIN_PASSWORD_LENGTH
              }
            >
              Sign up
            </LoadingButton>
          </form>
          <p className="text-sm text-muted-foreground text-center mt-4">
            Already have an account?{" "}
            <Link to={loginUrl} className="text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
      <AuthPageFooter appName="MyRecipes" />
    </div>
  );
}
