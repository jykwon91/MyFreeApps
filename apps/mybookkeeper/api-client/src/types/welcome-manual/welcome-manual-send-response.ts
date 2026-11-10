import type { WelcomeManualSendStatus } from "./welcome-manual-send-status";

/**
 * Mirrors backend `WelcomeManualSendResponse`. Returned at HTTP 200 even on a
 * failed/skipped send — ``status`` communicates the outcome so the email
 * dialog can render the correct result step.
 */
export interface WelcomeManualSendResponse {
  id: string;
  manual_id: string;
  recipient_email: string;
  recipient_name: string | null;
  status: WelcomeManualSendStatus;
  error_reason: string | null;
  created_at: string;
}
