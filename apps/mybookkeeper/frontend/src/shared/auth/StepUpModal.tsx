import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import * as Dialog from "@radix-ui/react-dialog";

import AlertBox from "@/shared/components/ui/AlertBox";
import { Button, LoadingButton } from "@platform/ui";
import {
  cancel as controllerCancel,
  getState,
  submitCode,
  subscribe,
} from "@/shared/auth/stepUpController";

const HEADLINE = "Confirm your identity";
const BODY =
  "This action requires a fresh verification code from your authenticator app.";

/**
 * MBK fork — byte-identical to packages/shared-frontend/src/auth/
 * StepUpModal.tsx, using MBK's local UI components. Will be deleted
 * once MBK migrates to React 19 and consumes from @platform/ui.
 *
 * Mount once at the app root (``App.tsx``). Subscribes to the
 * step-up controller and renders the modal whenever an axios response
 * has triggered a TOTP step-up.
 */
export default function StepUpModal() {
  const state = useSyncExternalStore(subscribe, getState, getState);
  const [code, setCode] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (state.pending) {
      setCode("");
    }
  }, [state.pending, state.attempt]);

  useEffect(() => {
    if (state.pending && inputRef.current) {
      inputRef.current.focus();
    }
  }, [state.pending, state.attempt]);

  const open = state.pending !== null;
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

  function handleCancel(): void {
    controllerCancel("user_cancelled");
  }

  function handleCodeChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const next = e.target.value.replace(/\D/g, "").slice(0, 6);
    setCode(next);
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) handleCancel();
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
              onClick={handleCancel}
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
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
