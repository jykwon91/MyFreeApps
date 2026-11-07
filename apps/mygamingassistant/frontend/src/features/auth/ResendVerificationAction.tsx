import { LoadingButton } from "@platform/ui";
import { RESEND_STATUS } from "@/constants/resendStatus";
import type { ResendStatus } from "@/types/auth/resendStatus";

interface ResendVerificationActionProps {
  status: ResendStatus;
  onResend: () => void;
}

/** The resend step of the "verify your email" notice: the button, then what happened. */
export default function ResendVerificationAction({ status, onResend }: ResendVerificationActionProps) {
  if (status === RESEND_STATUS.sent) {
    return <p className="text-emerald-700">Verification email sent. Check your inbox.</p>;
  }
  if (status === RESEND_STATUS.error) {
    return <p className="text-destructive">Couldn't resend right now. Try again shortly.</p>;
  }
  return (
    <LoadingButton
      type="button"
      isLoading={status === RESEND_STATUS.sending}
      loadingText="Sending..."
      className="w-full"
      onClick={onResend}
    >
      Resend verification email
    </LoadingButton>
  );
}
