import { LoadingButton } from "@platform/ui";
import { ResendStatusMode } from "@/constants/resendStatusModes";

interface ResendStatusAlertProps {
  status: ResendStatusMode;
  onResend: () => void;
}

/**
 * Resend-verification CTA and status line shown inside the Login page's
 * "please verify your email" panel.
 *
 * Renders one of three states via early returns rather than a nested ternary
 * in the parent JSX (the project forbids nested ternaries in JSX).
 */
export function ResendStatusAlert({ status, onResend }: ResendStatusAlertProps) {
  if (status === ResendStatusMode.SENT) {
    return (
      <p className="text-emerald-700">
        Verification email sent. Check your inbox.
      </p>
    );
  }

  if (status === ResendStatusMode.ERROR) {
    return (
      <p className="text-destructive">
        Couldn't resend right now. Try again shortly.
      </p>
    );
  }

  return (
    <LoadingButton
      type="button"
      isLoading={status === ResendStatusMode.SENDING}
      loadingText="Sending..."
      className="w-full"
      onClick={onResend}
    >
      Resend verification email
    </LoadingButton>
  );
}
