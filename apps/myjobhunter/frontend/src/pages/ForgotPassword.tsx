import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { LoadingButton, TurnstileWidget } from "@platform/ui";
import { Briefcase } from "lucide-react";
import { forgotPassword } from "@/lib/auth";

/**
 * Forgot-password entry — operator types their email, we POST to
 * ``/auth/forgot-password``, backend mails a token-bearing reset link
 * (or no-ops silently for unknown emails). The submitted-state UI
 * always shows "check your inbox" regardless of whether the address
 * was actually known — anti-enumeration.
 */
export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");

  const handleTurnstileVerify = useCallback((token: string) => {
    setTurnstileToken(token);
  }, []);

  const handleTurnstileExpire = useCallback(() => {
    setTurnstileToken("");
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!email.trim()) return;
    setIsLoading(true);
    try {
      await forgotPassword(email.trim(), turnstileToken);
    } catch {
      // Swallow — anti-enumeration. The UI always shows
      // "check your inbox" so a hostile observer can't tell from the
      // network response whether the email was registered.
    }
    setSubmitted(true);
    setIsLoading(false);
  }

  if (submitted) {
    return (
      <CenteredCard title="Check your inbox">
        <p className="text-sm text-muted-foreground mb-6">
          If an account exists for <strong>{email}</strong>, we've sent a
          password reset link. Check your inbox and spam folder.
        </p>
        <Link to="/login" className="text-sm text-primary hover:underline">
          Back to sign in
        </Link>
      </CenteredCard>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-muted">
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="bg-card border rounded-lg p-8 w-full max-w-sm shadow-sm">
          <div className="flex items-center gap-2 mb-6">
            <Briefcase className="size-6 text-primary" />
            <h1 className="text-2xl font-semibold">Reset your password</h1>
          </div>
          <p className="text-sm text-muted-foreground mb-6">
            Enter your account email and we'll send you a link to reset
            your password.
          </p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="forgot-email"
                className="block text-sm font-medium mb-1"
              >
                Email
              </label>
              <input
                id="forgot-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                required
                disabled={isLoading}
                autoComplete="email"
              />
            </div>
            <TurnstileWidget
              onVerify={handleTurnstileVerify}
              onExpire={handleTurnstileExpire}
            />
            <LoadingButton
              type="submit"
              isLoading={isLoading}
              loadingText="Sending..."
              className="w-full"
              disabled={isLoading || !email.trim()}
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
