import type { TurnFailure } from "@mylanguagetutor/api-client/types/session/turn-failure";

export interface TurnErrorBannerProps {
  failure: TurnFailure;
  onRetry: () => void;
  onDismiss: () => void;
}
