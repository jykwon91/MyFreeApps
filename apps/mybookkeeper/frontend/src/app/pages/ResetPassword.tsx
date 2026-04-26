import { useEffect, useRef, useState } from "react";
import { useSearchParams, Link, useNavigate } from "react-router-dom";
import api from "@/shared/lib/api";
import { extractErrorMessage } from "@/shared/utils/errorMessage";
import LoadingButton from "@/shared/components/ui/LoadingButton";

const MIN_PASSWORD_LENGTH = 12;

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const tokenRef = useRef(searchParams.get("token"));
  const token = tokenRef.current;

  // Clear token from URL to prevent leaking in browser history/referer
  useEffect(() => {
    if (token) {
      window.history.replaceState(null, "", "/reset-password");
    }
  }, [token]);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted">
        <div className="bg-card border rounded-lg p-8 w-full max-w-sm shadow-sm text-center">
          <h1 className="text-2xl font-semibold mb-4">Invalid link</h1>
          <p className="text-sm text-muted-foreground mb-6">
            This password reset link is invalid or has expired. Please request a
            new one.
          </p>
          <Link
            to="/forgot-password"
            className="text-sm text-primary hover:underline"
          >
            Request new link
          </Link>
        </div>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setIsLoading(true);

    try {
      await api.post("/auth/reset-password", { token, password });
      setSuccess(true);
    } catch (err) {
      const message = extractErrorMessage(err);
      if (message.toLowerCase().includes("token")) {
        setError("This reset link has expired or already been used. Please request a new one.");
      } else {
        setError(message || "Failed to reset password. Please try again.");
      }
    }

    setIsLoading(false);
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted">
        <div className="bg-card border rounded-lg p-8 w-full max-w-sm shadow-sm text-center">
          <h1 className="text-2xl font-semibold mb-4">Password reset</h1>
          <p className="text-sm text-muted-foreground mb-6">
            Your password has been updated. You can now sign in with your new
            password.
          </p>
          <button
            onClick={() => navigate("/login", { replace: true })}
            className="w-full bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:bg-primary/90"
          >
            Sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted">
      <div className="bg-card border rounded-lg p-8 w-full max-w-sm shadow-sm">
        <h1 className="text-2xl font-semibold mb-2">MyBookkeeper</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Choose a new password for your account.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="new-password" className="block text-sm font-medium mb-1">
              New password
            </label>
            <input
              id="new-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              required
              disabled={isLoading}
              minLength={MIN_PASSWORD_LENGTH}
            />
            <p className="text-xs text-muted-foreground mt-1">At least {MIN_PASSWORD_LENGTH} characters</p>
          </div>
          <div>
            <label htmlFor="confirm-password" className="block text-sm font-medium mb-1">
              Confirm password
            </label>
            <input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              required
              disabled={isLoading}
              minLength={MIN_PASSWORD_LENGTH}
            />
          </div>
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
          <LoadingButton
            type="submit"
            isLoading={isLoading}
            loadingText="Resetting..."
            className="w-full"
          >
            Reset password
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
