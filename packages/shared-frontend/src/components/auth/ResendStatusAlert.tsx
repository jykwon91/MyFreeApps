import { useEffect, useRef } from "react";
import { RESEND_VERIFICATION_COPY } from "@platform/core/constants/resendVerification";
import LoadingButton from "../ui/LoadingButton";
import type { ResendStatusAlertProps } from "../../types/resend-status-alert-props";
import type { ResendStatus } from "../../types/resend-status";

/**
 * The sign-in page's "Resend verification email" button and what came of pressing it.
 *
 * Both message regions stay mounted so a screen reader hears the outcome: "sent" when it's
 * next idle, "failed" at once. The button stays too, so the user can send again or retry,
 * and gets focus back after the send (the browser drops focus to the page while it's disabled).
 */
export default function ResendStatusAlert({ status, onResend }: ResendStatusAlertProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const previousStatus = useRef<ResendStatus>(status);

  useEffect(() => {
    const finishedSending = previousStatus.current === "sending" && status !== "sending";
    previousStatus.current = status;
    const focusDropped = document.activeElement === null || document.activeElement === document.body;
    if (finishedSending && focusDropped) buttonRef.current?.focus();
  }, [status]);

  return (
    <div>
      <LoadingButton
        ref={buttonRef}
        type="button"
        isLoading={status === "sending"}
        loadingText={RESEND_VERIFICATION_COPY.loading}
        className="w-full"
        onClick={onResend}
      >
        {RESEND_VERIFICATION_COPY.label}
      </LoadingButton>
      <p
        role="status"
        data-testid="resend-verification-sent"
        className={status === "sent" ? "mt-2 text-sm text-emerald-700 dark:text-emerald-400" : undefined}
      >
        {status === "sent" ? RESEND_VERIFICATION_COPY.sent : null}
      </p>
      <p role="alert" className={status === "error" ? "mt-2 text-sm text-destructive" : undefined}>
        {status === "error" ? RESEND_VERIFICATION_COPY.failed : null}
      </p>
    </div>
  );
}
