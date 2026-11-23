import { useState } from "react";
import LoadingButton from "../ui/LoadingButton";
import { useCooldown } from "../../hooks/useCooldown";
import { describeAuthError } from "../../utils/describeAuthError";
import { isRateLimitedError } from "../../utils/isRateLimitedError";
import { RATE_LIMIT_COOLDOWN_SECONDS } from "../../constants/rate-limit-cooldown";
import {
  TWO_FACTOR_CODE_MAX_LENGTH,
  TWO_FACTOR_CODE_MIN_LENGTH,
  TWO_FACTOR_STEP_COPY,
} from "../../constants/two-factor-step";
import type { TwoFactorStepProps } from "../../types/two-factor-step-props";

const NON_CODE_CHARACTERS = /[^A-Za-z0-9]/g;

/**
 * The sign-in step for an account with 2FA on: one field that takes the
 * authenticator app's 6-digit code or an 8-character recovery code.
 */
export default function TwoFactorStep({ onVerify, onBack }: TwoFactorStepProps) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const cooldown = useCooldown();
  const isComplete = code.length >= TWO_FACTOR_CODE_MIN_LENGTH;

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!isComplete) return;

    setError("");
    setIsVerifying(true);
    try {
      if (!(await onVerify(code))) setError(TWO_FACTOR_STEP_COPY.notAccepted);
    } catch (err) {
      if (isRateLimitedError(err)) {
        setError(TWO_FACTOR_STEP_COPY.rateLimited);
        cooldown.start(RATE_LIMIT_COOLDOWN_SECONDS);
      } else {
        setError(describeAuthError(err));
      }
    } finally {
      setIsVerifying(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="totp-code" className="block text-sm font-medium mb-1">
          {TWO_FACTOR_STEP_COPY.label}
        </label>
        <p className="text-xs text-muted-foreground mb-2">{TWO_FACTOR_STEP_COPY.hint}</p>
        <input
          id="totp-code"
          type="text"
          inputMode="text"
          autoComplete="one-time-code"
          value={code}
          onChange={(e) =>
            setCode(e.target.value.replace(NON_CODE_CHARACTERS, "").slice(0, TWO_FACTOR_CODE_MAX_LENGTH))
          }
          className="w-full border rounded-md px-3 py-2 text-sm font-mono text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
          placeholder={TWO_FACTOR_STEP_COPY.placeholder}
          maxLength={TWO_FACTOR_CODE_MAX_LENGTH}
          autoFocus
        />
      </div>
      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
      <LoadingButton
        type="submit"
        isLoading={isVerifying}
        loadingText={TWO_FACTOR_STEP_COPY.verifying}
        className="w-full"
        disabled={!isComplete || cooldown.secondsLeft > 0}
      >
        {cooldown.secondsLeft > 0
          ? TWO_FACTOR_STEP_COPY.retryIn(cooldown.secondsLeft)
          : TWO_FACTOR_STEP_COPY.verify}
      </LoadingButton>
      <button
        type="button"
        onClick={onBack}
        className="w-full text-sm text-muted-foreground hover:underline min-h-[44px]"
      >
        {TWO_FACTOR_STEP_COPY.back}
      </button>
    </form>
  );
}
