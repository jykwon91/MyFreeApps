import { useState, useCallback } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import api from "@/shared/lib/api";
import { login } from "@/shared/lib/auth";
import { extractErrorMessage } from "@/shared/utils/errorMessage";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import TurnstileWidget from "@/shared/components/ui/TurnstileWidget";

export default function Register() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get("returnTo");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
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

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
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
      await login(email.trim(), password);
      navigate(returnTo ?? "/", { replace: true });
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted">
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
              minLength={8}
            />
          </div>
          <TurnstileWidget onVerify={handleTurnstileVerify} onExpire={handleTurnstileExpire} />
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
          <LoadingButton type="submit" isLoading={isLoading} loadingText="Creating account..." className="w-full">
            Sign up
          </LoadingButton>
        </form>
        <p className="text-sm text-muted-foreground text-center mt-4">
          Already have an account?{" "}
          <Link to="/login" className="text-primary hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
