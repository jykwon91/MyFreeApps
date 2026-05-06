import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  LoadingButton,
  PasswordPair,
  extractErrorMessage,
} from "@platform/ui";
import { Briefcase } from "lucide-react";
import { resetPassword } from "@/lib/auth";

/**
 * Reset-password page — invoked from the email link the operator
 * received after submitting the forgot-password form. The token from
 * ``?token=...`` proves they own the email; submitting a new password
 * updates the account.
 *
 * The token is captured once on mount, then stripped from the URL via
 * ``window.history.replaceState`` so it doesn't leak into the browser
 * history / referer headers if the operator navigates away.
 *
 * Password pair (new + confirm + show/hide toggle + a11y) comes from
 * the shared ``PasswordPair`` so this stays in sync with the
 * Register page's UX.
 */
export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [token] = useState(() => searchParams.get("token"));

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
      <CenteredCard title="Invalid link">
        <p className="text-sm text-muted-foreground mb-6">
          This password reset link is invalid or has expired. Request a
          fresh one to continue.
        </p>
        <Link
          to="/forgot-password"
          className="text-sm text-primary hover:underline"
        >
          Request new link
        </Link>
      </CenteredCard>
    );
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");

    if (password.length < 12) {
      setError("Password must be at least 12 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setIsLoading(true);
    try {
      await resetPassword(token!, password);
      setSuccess(true);
    } catch (err) {
      const message = extractErrorMessage(err);
      if (message.toLowerCase().includes("token")) {
        setError(
          "This reset link has expired or already been used. Request a new one.",
        );
      } else {
        setError(message || "Failed to reset password. Please try again.");
      }
    }
    setIsLoading(false);
  }

  if (success) {
    return (
      <CenteredCard title="Password updated">
        <p className="text-sm text-muted-foreground mb-6">
          You can sign in with your new password now.
        </p>
        <button
          type="button"
          onClick={() => navigate("/login", { replace: true })}
          className="w-full bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:bg-primary/90"
        >
          Sign in
        </button>
      </CenteredCard>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-muted">
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="bg-card border rounded-lg p-8 w-full max-w-sm shadow-sm">
          <div className="flex items-center gap-2 mb-6">
            <Briefcase className="size-6 text-primary" />
            <h1 className="text-2xl font-semibold">Choose a new password</h1>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <PasswordPair
              password={password}
              onPasswordChange={setPassword}
              confirmPassword={confirmPassword}
              onConfirmPasswordChange={setConfirmPassword}
              label="New password"
              disabled={isLoading}
            />
            {error ? (
              <p className="text-destructive text-sm">{error}</p>
            ) : null}
            <LoadingButton
              type="submit"
              isLoading={isLoading}
              loadingText="Resetting..."
              className="w-full"
              disabled={
                isLoading ||
                password.length < 12 ||
                password !== confirmPassword
              }
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
    </div>
  );
}

interface CenteredCardProps {
  title: string;
  children: React.ReactNode;
}

function CenteredCard({ title, children }: CenteredCardProps) {
  return (
    <div className="min-h-screen flex flex-col bg-muted">
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="bg-card border rounded-lg p-8 w-full max-w-sm shadow-sm text-center">
          <h1 className="text-2xl font-semibold mb-4">{title}</h1>
          {children}
        </div>
      </div>
    </div>
  );
}
