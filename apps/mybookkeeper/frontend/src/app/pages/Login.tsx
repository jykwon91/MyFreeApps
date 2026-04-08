import { useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { login } from "@/shared/lib/auth";
import { extractErrorMessage } from "@/shared/utils/errorMessage";
import LoadingButton from "@/shared/components/ui/LoadingButton";

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

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
      setError(needsTotp ? extractErrorMessage(err) : "Invalid email or password");
      setIsLoading(false);
    }
  }

  const registerUrl = returnTo
    ? `/register?returnTo=${encodeURIComponent(returnTo)}`
    : "/register";

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted">
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
                  disabled={isLoading}
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
                  disabled={isLoading}
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
          <LoadingButton type="submit" isLoading={isLoading} loadingText="Signing in..." className="w-full">
            {needsTotp ? "Verify" : "Sign in"}
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
  );
}
