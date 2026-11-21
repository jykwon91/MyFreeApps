import type { ResendStatus } from "./resend-status";

export interface ResendStatusAlertProps {
  status: ResendStatus;
  onResend: () => void;
}
