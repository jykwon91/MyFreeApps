/**
 * Steps of the in-place email-to-guest flow:
 *   - ``form``    — the recipient form (step 1)
 *   - ``sent``    — green success result
 *   - ``failed``  — amber couldn't-send result (offers "Try again")
 *   - ``skipped`` — blue email-not-configured result (no retry; it's infra)
 *
 * The ``sent`` / ``failed`` / ``skipped`` values mirror
 * ``WelcomeManualSendStatus`` so the send response maps directly to a step.
 */
export type WelcomeManualEmailDialogStep = "form" | "sent" | "failed" | "skipped";
