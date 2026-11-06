import { useId, useRef, useState, type FormEvent } from "react";
import { Eye, EyeOff } from "lucide-react";
import { LoadingButton } from "@platform/ui";
import { triageApi, verifyTriageKey } from "@/games/wow-forever/api/triageApi";
import { TRIAGE_COPY } from "@/games/wow-forever/data/featureRequests/triage/triageCopy";
import { TRIAGE_KEY_USERNAME } from "@/games/wow-forever/data/featureRequests/triage/triageConfig";
import { TRIAGE_INPUT } from "@/games/wow-forever/data/featureRequests/triage/triageStyles";
import { useCountdown } from "@/games/wow-forever/hooks/featureRequests/triage/useCountdown";
import { unlockTriage } from "@/games/wow-forever/lib/featureRequests/triage/triageKeyStore";
import { triageStore } from "@/games/wow-forever/lib/featureRequests/triage/triageStore";
import { waitSecondsLabel } from "@/games/wow-forever/lib/featureRequests/triage/triageFormat";
import type { TriageLockReason } from "@/games/wow-forever/types/featureRequests/triage/triageLockReason";

interface TriageUnlockFormProps {
  lockReason: TriageLockReason | null;
}

const DEFAULT_WAIT_SECONDS = 60;

const LOCK_MESSAGE: Readonly<Record<TriageLockReason, string | null>> = {
  manual: null,
  idle: TRIAGE_COPY.lockedIdle,
  rejected: TRIAGE_COPY.lockedRejected,
};

/**
 * "Operator sign-in". The key is checked with one inbox read and kept in memory only. The input has no
 * `name` (it's never submitted anywhere); the hidden username field lets a password manager save it.
 * A wrong key and a switched-off triage API answer the same 404, so they get the same message.
 */
export default function TriageUnlockForm({ lockReason }: TriageUnlockFormProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryUntil, setRetryUntil] = useState<number | null>(null);
  const secondsLeft = useCountdown(retryUntil);
  const waiting = secondsLeft > 0;

  async function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const key = inputRef.current?.value.trim() ?? "";
    if (key === "" || busy || waiting) return;
    setBusy(true);
    setError(null);
    const result = await verifyTriageKey(key);
    setBusy(false);
    if (result.ok) {
      triageStore.dispatch(triageApi.util.upsertQueryData("getTriageInbox", undefined, result.data));
      if (inputRef.current !== null) inputRef.current.value = "";
      unlockTriage(key);
      return;
    }
    if (result.error.status === 429) {
      setRetryUntil(Date.now() + (result.error.retryAfterSeconds ?? DEFAULT_WAIT_SECONDS) * 1000);
      return;
    }
    setError(result.error.status === null ? TRIAGE_COPY.network : TRIAGE_COPY.wrongKey);
  }

  const lockMessage = lockReason === null ? null : LOCK_MESSAGE[lockReason];
  const message = waiting ? waitSecondsLabel(secondsLeft) : error;

  return (
    <main className="mx-auto max-w-md p-4 sm:p-8">
      <form
        method="post"
        action=""
        onSubmit={(e) => void unlock(e)}
        className="space-y-4 rounded-xl border bg-card p-6"
        aria-labelledby={`${inputId}-heading`}
      >
        <h1 id={`${inputId}-heading`} className="text-lg font-semibold">
          {TRIAGE_COPY.signInHeading}
        </h1>
        {lockMessage !== null ? (
          <p role="status" className="text-sm text-muted-foreground">
            {lockMessage}
          </p>
        ) : null}
        <input type="text" autoComplete="username" value={TRIAGE_KEY_USERNAME} readOnly hidden aria-hidden tabIndex={-1} />
        <div className="space-y-1">
          <label htmlFor={inputId} className="text-sm font-medium">
            {TRIAGE_COPY.keyLabel}
          </label>
          <div className="flex gap-2">
            <input
              id={inputId}
              ref={inputRef}
              type={visible ? "text" : "password"}
              autoComplete="current-password"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
              aria-invalid={error !== null}
              aria-describedby={message !== null ? `${inputId}-error` : undefined}
              className={TRIAGE_INPUT}
            />
            <button
              type="button"
              onClick={() => setVisible((v) => !v)}
              aria-label={visible ? TRIAGE_COPY.hideKey : TRIAGE_COPY.showKey}
              aria-pressed={visible}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border hover:bg-muted"
            >
              {visible ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
            </button>
          </div>
        </div>
        {message !== null ? (
          <p id={`${inputId}-error`} role="alert" className="text-sm text-red-600 dark:text-red-400">
            {message}
          </p>
        ) : null}
        <LoadingButton type="submit" isLoading={busy} loadingText={TRIAGE_COPY.unlocking} disabled={waiting} className="w-full">
          {TRIAGE_COPY.unlock}
        </LoadingButton>
      </form>
    </main>
  );
}
