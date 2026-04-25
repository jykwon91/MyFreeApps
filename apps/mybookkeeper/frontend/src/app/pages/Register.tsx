import { useState, useCallback } from "react";
import { useSearchParams, Link } from "react-router-dom";
import api from "@/shared/lib/api";
import { extractErrorMessage } from "@/shared/utils/errorMessage";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import TurnstileWidget from "@/shared/components/ui/TurnstileWidget";
import LegalFooter from "@/app/components/LegalFooter";

export default function Register() {
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get("returnTo");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 12) {
      setError("Password must be at least 12 characters");
      return;
    }

    setIsLoading(true);

    try {
      await api.post("/auth/register", {
        email: email.trim(),
        password,
        name: name.trim() || null,
      }, {
        headers: turnstileToken ? { "X-Turnstile-Token": turnstileToken } : {},
      });
      setRegistered(true);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }

  const loginUrl = returnTo
    ? `/login?returnTo=${encodeURIComponent(returnTo)}`
    : "/login";

  if (registered) {
    return (
      <div className="min-h-screen flex flex-col bg-muted">
        <div className="flex-1 flex items-center justify-center">
          <div className="bg-card border rounded-lg p-8 w-full max-w-sm shadow-sm text-center">
            <h1 className="text-2xl font-semibold mb-4">Check your inbox</h1>
            <p className="text-sm text-muted-foreground mb-6">
              We sent a verification link to <strong>{email}</strong>. Click the link in that email to activate your account.
            </p>
            <p className="text-sm text-muted-foreground">
              Already verified?{" "}
              <Link to={loginUrl} className="text-primary hover:underline">Sign in</Link>
            </p>
          </div>
        </div>
        <LegalFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-muted">
      <div className="flex-1 flex items-center justify-center">
        <div className="bg-card border rounded-lg p-8 w-full max-w-sm shadow-sm">
          <h1 className="text-2xl font-semibold mb-6">Create an account</h1>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Optional"
                className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                required
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
                minLength={12}
              />
            </div>
            <TurnstileWidget onVerify={handleTurnstileVerify} onExpire={handleTurnstileExpire} />
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border border-input accent-primary cursor-pointer"
                data-testid="terms-checkbox"
              />
              <span className="text-sm text-muted-foreground leading-snug">
                I agree to the{" "}
                <Link to="/terms" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
                  Terms of Service
                </Link>{" "}
                and{" "}
                <Link to="/privacy" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
                  Privacy Policy
                </Link>
                .
              </span>
            </label>
            {error ? <p className="text-destructive text-sm">{error}</p> : null}
            <LoadingButton
              type="submit"
              isLoading={isLoading}
              loadingText="Creating account..."
              className="w-full"
              disabled={isLoading || !termsAccepted}
            >
              Sign up
            </LoadingButton>
          </form>
          <p className="text-sm text-muted-foreground text-center mt-4">
            Already have an account?{" "}
            <Link to="/login" className="text-primary hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
      <LegalFooter />
    </div>
  );
}
