import { useCallback, useState } from "react";
import {
  LoadingButton,
  TurnstileWidget,
  extractErrorMessage,
} from "@platform/ui";
import { register } from "@/lib/auth";

export interface InviteRegisterFormProps {
  /** The bound recipient email — locked / read-only on the form. */
  email: string;
  /** Called after a successful POST /auth/register. The page swaps to
   * a "check your inbox" notice via this callback. */
  onRegistered: () => void;
}

const MIN_PASSWORD_LENGTH = 12;

/**
 * Registration form for an invite recipient.
 *
 * The email field is rendered read-only — the invite is bound to a
 * specific address and the backend will reject any other email.
 * Password + Turnstile are the only inputs; success calls
 * `onRegistered` so the parent can swap to a "check your email"
 * confirmation. Verification + login + accept happen on later page
 * loads (the verification email links back to this same URL via
 * the invite token).
 */
export default function InviteRegisterForm({
  email,
  onRegistered,
}: InviteRegisterFormProps) {
  const [password, setPassword] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleTurnstileVerify = useCallback((token: string) => {
    setTurnstileToken(token);
  }, []);
  const handleTurnstileExpire = useCallback(() => {
    setTurnstileToken("");
  }, []);

  const passwordMeetsMin = password.length >= MIN_PASSWORD_LENGTH;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage("");
    setIsSubmitting(true);
    try {
      await register(email, password, turnstileToken);
      onRegistered();
    } catch (err) {
      setErrorMessage(extractErrorMessage(err));
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label
          htmlFor="invite-email"
          className="block text-sm font-medium mb-1"
        >
          Email
        </label>
        <input
          id="invite-email"
          type="email"
          value={email}
          disabled
          readOnly
          aria-readonly="true"
          className="w-full border rounded-md px-3 py-2 text-sm bg-muted text-muted-foreground"
        />
        <p className="text-xs text-muted-foreground mt-1">
          This invite is for this email address.
        </p>
      </div>

      <div>
        <label
          htmlFor="invite-password"
          className="block text-sm font-medium mb-1"
        >
          Password
        </label>
        <input
          id="invite-password"
          type="password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={isSubmitting}
          className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50 min-h-[44px]"
        />
        <p
          className={
            passwordMeetsMin
              ? "text-xs text-green-600 mt-1"
              : "text-xs text-muted-foreground mt-1"
          }
        >
          {passwordMeetsMin ? "✓ " : ""}At least {MIN_PASSWORD_LENGTH}{" "}
          characters
        </p>
      </div>

      <TurnstileWidget
        onVerify={handleTurnstileVerify}
        onExpire={handleTurnstileExpire}
      />

      {errorMessage ? (
        <p className="text-destructive text-sm" role="alert">
          {errorMessage}
        </p>
      ) : null}

      <LoadingButton
        type="submit"
        isLoading={isSubmitting}
        loadingText="Creating account..."
        disabled={isSubmitting || !passwordMeetsMin}
        className="w-full"
      >
        Create account
      </LoadingButton>
    </form>
  );
}
