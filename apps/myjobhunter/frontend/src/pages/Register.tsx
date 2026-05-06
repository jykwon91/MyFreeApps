import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams, Navigate } from "react-router-dom";
import {
  LoadingButton,
  TurnstileWidget,
  extractErrorMessage,
} from "@platform/ui";
import { Briefcase } from "lucide-react";
import { register } from "@/lib/auth";
import { useGetInviteInfoQuery } from "@/store/invitesApi";

const INVITE_TOKEN_STORAGE_KEY = "myjobhunter.pendingInviteToken";

/**
 * Invite-only registration page.
 *
 * Reads the ``?invite=<token>`` query param, validates the token via
 * ``GET /invites/{token}/info``, and pre-binds the email field to the
 * invited address. MyJobHunter does not (yet) support self-serve
 * registration — without a valid invite the page rejects the user with
 * a "go to login" CTA.
 *
 * After a successful POST /auth/register the page stores the raw
 * invite token in ``sessionStorage`` so that a follow-up post-login
 * step can call ``POST /invites/{token}/accept`` to mark the audit
 * trail. The accept step is best-effort and not blocking — the account
 * is fully usable even if the accept call never fires.
 */
export default function Register() {
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get("invite") || "";

  if (!inviteToken) {
    return <Navigate to="/login" replace />;
  }

  return <RegisterWithInvite token={inviteToken} />;
}

interface RegisterWithInviteProps {
  token: string;
}

function RegisterWithInvite({ token }: RegisterWithInviteProps) {
  const {
    data: invite,
    isLoading,
    isError,
    error,
  } = useGetInviteInfoQuery(token);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);

  const handleTurnstileVerify = useCallback((value: string) => {
    setTurnstileToken(value);
  }, []);

  const handleTurnstileExpire = useCallback(() => {
    setTurnstileToken("");
  }, []);

  useEffect(() => {
    if (registered && token) {
      try {
        sessionStorage.setItem(INVITE_TOKEN_STORAGE_KEY, token);
      } catch {
        // sessionStorage failure is non-fatal — accept is best-effort
      }
    }
  }, [registered, token]);

  if (isLoading) {
    return <CenteredCard title="Checking your invite…" />;
  }

  if (isError) {
    return (
      <InviteRejectedCard
        message={
          extractInviteErrorMessage(error) ??
          "This invite link is invalid or has expired."
        }
      />
    );
  }

  if (!invite) {
    return <InviteRejectedCard message="Could not load invite details." />;
  }

  if (invite.status === "expired") {
    return (
      <InviteRejectedCard message="This invite has expired. Ask the operator to send a new one." />
    );
  }

  if (invite.status === "accepted") {
    return (
      <InviteRejectedCard
        message="This invite has already been used. Sign in to your account instead."
        showLogin
      />
    );
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitError("");

    if (password.length < 12) {
      setSubmitError("Password must be at least 12 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setSubmitError("Passwords don't match. Re-type the same password in both fields.");
      return;
    }

    setIsSubmitting(true);
    try {
      await register(invite!.email, password, turnstileToken);
      setRegistered(true);
    } catch (err) {
      setSubmitError(extractErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (registered) {
    return (
      <CenteredCard title="Check your inbox">
        <p className="text-sm text-muted-foreground">
          We sent a verification link to <strong>{invite.email}</strong>. Click
          the link in that email to activate your account, then{" "}
          <Link to="/login" className="text-primary hover:underline">
            sign in
          </Link>
          .
        </p>
      </CenteredCard>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-muted">
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="bg-card border rounded-lg p-8 w-full max-w-sm shadow-sm">
          <div className="flex items-center gap-2 mb-6">
            <Briefcase className="size-6 text-primary" />
            <h1 className="text-2xl font-semibold">Create your account</h1>
          </div>
          <p className="text-sm text-muted-foreground mb-6">
            You've been invited to MyJobHunter. Set a password to finish
            creating your account.
          </p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <input
                type="email"
                value={invite.email}
                readOnly
                className="w-full border rounded-md px-3 py-2 text-sm bg-muted text-muted-foreground cursor-not-allowed"
                aria-readonly="true"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Bound to your invite. Contact the operator to use a different
                address.
              </p>
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
                placeholder="At least 12 characters"
                autoComplete="new-password"
                aria-describedby="password-hint"
              />
              <p
                id="password-hint"
                className="text-xs text-muted-foreground mt-1"
              >
                At least 12 characters.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Confirm password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onBlur={() => setConfirmTouched(true)}
                className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                required
                minLength={12}
                placeholder="Confirm your password"
                autoComplete="new-password"
                aria-invalid={
                  confirmTouched && confirmPassword !== password
                }
                aria-describedby={
                  confirmTouched && confirmPassword !== password
                    ? "confirm-password-error"
                    : undefined
                }
              />
              {confirmTouched && confirmPassword !== password ? (
                <p
                  id="confirm-password-error"
                  role="alert"
                  className="text-xs text-destructive mt-1"
                >
                  Passwords don't match.
                </p>
              ) : null}
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
              />
              <span className="text-sm text-muted-foreground leading-snug">
                I agree to use this service responsibly.
              </span>
            </label>
            {submitError ? (
              <p className="text-destructive text-sm">{submitError}</p>
            ) : null}
            <LoadingButton
              type="submit"
              isLoading={isSubmitting}
              loadingText="Creating account…"
              className="w-full"
              disabled={
                isSubmitting ||
                !termsAccepted ||
                password.length < 12 ||
                password !== confirmPassword
              }
            >
              Sign up
            </LoadingButton>
          </form>
          <p className="text-sm text-muted-foreground text-center mt-4">
            Already have an account?{" "}
            <Link to="/login" className="text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

interface CenteredCardProps {
  title: string;
  children?: React.ReactNode;
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

interface InviteRejectedCardProps {
  message: string;
  showLogin?: boolean;
}

function InviteRejectedCard({ message, showLogin = true }: InviteRejectedCardProps) {
  return (
    <CenteredCard title="Invite unavailable">
      <p className="text-sm text-muted-foreground mb-6">{message}</p>
      {showLogin ? (
        <Link
          to="/login"
          className="text-primary hover:underline text-sm"
        >
          Go to sign in
        </Link>
      ) : null}
    </CenteredCard>
  );
}

function extractInviteErrorMessage(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const detail = (error as { data?: { detail?: unknown } })?.data?.detail;
  return typeof detail === "string" ? detail : null;
}
