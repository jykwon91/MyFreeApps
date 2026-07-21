import { useRef, useState } from "react";
import { LoadingButton } from "@platform/ui";

export type PublicWelcomeManualUnlockError = "invalid" | "rate-limited" | "unknown";

export interface PublicWelcomeManualUnlockResult {
  success: boolean;
  error?: PublicWelcomeManualUnlockError;
}

export interface PublicWelcomeManualPinFormProps {
  onSubmit: (pin: string) => Promise<PublicWelcomeManualUnlockResult>;
}

const ERROR_MESSAGES: Record<PublicWelcomeManualUnlockError, string> = {
  invalid: "Incorrect code — try again.",
  "rate-limited": "Too many attempts. Try again in a few minutes.",
  unknown: "Something went wrong. Please try again.",
};

/**
 * PIN entry gate for the public welcome-manual guide page. The code is never
 * put in the URL — it's submitted via POST so it doesn't leak into browser
 * history, referrer headers, or server access logs.
 */
export default function PublicWelcomeManualPinForm({ onSubmit }: PublicWelcomeManualPinFormProps) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = pin.trim();
    if (!trimmed || submitting) return;

    setSubmitting(true);
    setError(null);
    const result = await onSubmit(trimmed);
    setSubmitting(false);

    if (!result.success) {
      setError(ERROR_MESSAGES[result.error ?? "unknown"]);
      setPin("");
      inputRef.current?.focus();
    }
  }

  return (
    <div
      className="bg-card border rounded-lg p-8 w-full max-w-sm shadow-sm"
      data-testid="public-welcome-manual-pin-form"
    >
      <h1 className="text-xl font-semibold mb-2 text-center">Enter your access code</h1>
      <p className="text-sm text-muted-foreground mb-6 text-center">
        Your host gave you a short code along with this link.
      </p>
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        <input
          ref={inputRef}
          type="text"
          autoComplete="off"
          autoFocus
          maxLength={12}
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="Access code"
          aria-label="Access code"
          disabled={submitting}
          className="w-full border rounded-md px-3 py-2 text-center text-lg tracking-widest font-mono min-h-[44px]"
          data-testid="public-welcome-manual-pin-input"
        />
        {error ? (
          <p
            className="text-sm text-red-600 text-center"
            role="alert"
            data-testid="public-welcome-manual-pin-error"
          >
            {error}
          </p>
        ) : null}
        <LoadingButton
          type="submit"
          className="w-full"
          isLoading={submitting}
          loadingText="Checking..."
          disabled={!pin.trim() || submitting}
          data-testid="public-welcome-manual-pin-submit"
        >
          Unlock
        </LoadingButton>
      </form>
    </div>
  );
}
