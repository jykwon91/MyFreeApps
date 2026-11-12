import { PRACTICE_COPY } from "@mylanguagetutor/api-client/constants/practiceCopy";
import { turnErrorCopy } from "@mylanguagetutor/api-client/utils/turnErrorCopy";
import { Banner } from "@platform/mobile";
import type { TurnErrorBannerProps } from "../../types/TurnErrorBannerProps";

/** A turn that failed. "Try again" sends exactly what the learner wrote. */
export default function TurnErrorBanner({ failure, onRetry, onDismiss }: TurnErrorBannerProps) {
  const dismiss = { label: PRACTICE_COPY.dismiss, onPress: onDismiss };
  return (
    <Banner
      actions={failure.retryable ? [{ label: PRACTICE_COPY.tryAgain, onPress: onRetry }, dismiss] : [dismiss]}
      message={turnErrorCopy(failure.code)}
    />
  );
}
