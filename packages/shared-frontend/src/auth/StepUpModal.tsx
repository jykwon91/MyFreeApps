import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import * as Dialog from "@radix-ui/react-dialog";

import AlertBox from "../components/ui/AlertBox";
import Button from "../components/ui/Button";
import LoadingButton from "../components/ui/LoadingButton";
import {
  cancel as controllerCancel,
  getState,
  submitCode,
  subscribe,
} from "./stepUpController";
import type { StepUpControllerState } from "./types/StepUpControllerState";

const HEADLINE = "Confirm your identity";
const BODY =
  "This action requires a fresh verification code from your authenticator app.";

/**
 * Mount once at the app root (e.g. in ``RootLayout`` / ``App.tsx``).
 * Subscribes to the step-up controller and renders the modal whenever
 * an axios response has triggered a TOTP step-up. Exact-once mount —
 * mounting twice would create two modals on the same controller event.
 */
export default function StepUpModal() {
  const state = useSyncExternalStore(subscribe, getState, getState);
  const open = state.pending !== null;

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) controllerCancel("user_cancelled");
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[80]" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[80] w-full max-w-sm rounded-lg border bg-card p-6 shadow-lg"
          aria-describedby="step-up-description"
        >
          <Dialog.Title className="text-base font-semibold">
            {HEADLINE}
          </Dialog.Title>
          <Dialog.Description
            id="step-up-description"
            className="text-sm text-muted-foreground mt-2"
          >
            {BODY}
          </Dialog.Description>
          {state.pending !== null && (
            <StepUpForm
              key={`${state.pending}-${state.attempt}`}
              state={state}
            />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

interface StepUpFormProps {
  state: StepUpControllerState;
}

// Keyed on `${state.pending}-${state.attempt}` so a new challenge or a
// retry remounts this component, resetting `code` to "" via the useState
// initializer. Replaces a setState-in-effect anti-pattern that React 19's
// `react-hooks/set-state-in-effect` rule rejects.
function StepUpForm({ state }: StepUpFormProps) {
  const [code, setCode] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submitDisabled =
    state.submitting || code.length !== 6 || !/^\d{6}$/.test(code);

  function handleSubmit(): void {
    if (submitDisabled) return;
    submitCode(code);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  }

  function handleCodeChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const next = e.target.value.replace(/\D/g, "").slice(0, 6);
    setCode(next);
  }

  return (
    <>
      <div className="mt-4 space-y-3">
        <label
          htmlFor="step-up-totp-code"
          className="block text-sm font-medium"
        >
          6-digit code
        </label>
        <input
          id="step-up-totp-code"
          ref={inputRef}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          value={code}
          onChange={handleCodeChange}
          onKeyDown={handleKeyDown}
          disabled={state.submitting}
          className="w-full rounded-md border bg-background px-3 py-2 text-center font-mono text-lg tracking-widest focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60"
          aria-invalid={state.errorMessage != null ? "true" : undefined}
          aria-describedby={
            state.errorMessage != null ? "step-up-error" : undefined
          }
        />
        {state.errorMessage != null && (
          <AlertBox variant="error" className="mt-2">
            <span id="step-up-error" role="alert">
              {state.errorMessage}
            </span>
          </AlertBox>
        )}
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => controllerCancel("user_cancelled")}
          disabled={state.submitting}
        >
          Cancel
        </Button>
        <LoadingButton
          size="sm"
          isLoading={state.submitting}
          loadingText="Verifying..."
          onClick={handleSubmit}
          disabled={submitDisabled}
        >
          Verify
        </LoadingButton>
      </div>
    </>
  );
}
