import { useState, useCallback } from "react";
import { Link } from "react-router-dom";
import api from "@/shared/lib/api";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import TurnstileWidget from "@/shared/components/ui/TurnstileWidget";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");

  const handleTurnstileVerify = useCallback((token: string) => {
    setTurnstileToken(token);
  }, []);

  const handleTurnstileExpire = useCallback(() => {
    setTurnstileToken("");
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!email.trim()) {
      setError("Email is required");
      return;
    }

    setIsLoading(true);

    try {
      await api.post("/auth/forgot-password", { email: email.trim() }, {
        headers: turnstileToken ? { "X-Turnstile-Token": turnstileToken } : {},
      });
    } catch {
      // Always show success to prevent email enumeration
    }

    setSubmitted(true);
    setIsLoading(false);
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted">
        <div className="bg-card border rounded-lg p-8 w-full max-w-sm shadow-sm text-center">
          <h1 className="text-2xl font-semibold mb-4">Check your email</h1>
          <p className="text-sm text-muted-foreground mb-6">
            If an account exists for <strong>{email}</strong>, we sent a password
            reset link. Check your inbox and spam folder.
          </p>
          <Link
            to="/login"
            className="text-sm text-primary hover:underline"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted">
      <div className="bg-card border rounded-lg p-8 w-full max-w-sm shadow-sm">
        <h1 className="text-2xl font-semibold mb-2">MyBookkeeper</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Enter your email and we'll send you a link to reset your password.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="reset-email" className="block text-sm font-medium mb-1">Email</label>
            <input
              id="reset-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              required
              disabled={isLoading}
            />
          </div>
          <TurnstileWidget onVerify={handleTurnstileVerify} onExpire={handleTurnstileExpire} />
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
          <LoadingButton
            type="submit"
            isLoading={isLoading}
            loadingText="Sending..."
            className="w-full"
          >
            Send reset link
          </LoadingButton>
        </form>
        <p className="text-sm text-muted-foreground text-center mt-4">
          <Link to="/login" className="text-primary hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
