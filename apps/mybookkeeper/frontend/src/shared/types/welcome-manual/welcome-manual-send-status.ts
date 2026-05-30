/**
 * Outcome of a welcome-manual email send. Mirrors the backend
 * ``WELCOME_MANUAL_SEND_STATUSES`` tuple (String(20) + CheckConstraint):
 *   - ``sent``    — SMTP accepted the message
 *   - ``failed``  — SMTP rejected/errored (retryable)
 *   - ``skipped`` — preconditions unmet (e.g. SMTP not configured on this deploy)
 */
export type WelcomeManualSendStatus = "sent" | "failed" | "skipped";
