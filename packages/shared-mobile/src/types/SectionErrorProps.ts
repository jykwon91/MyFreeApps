import type { PressHandler } from "./PressHandler";

export interface SectionErrorProps {
  message: string;
  retryLabel: string;
  /** Shown on the button while the retry is in flight. */
  retryingLabel?: string;
  onRetry: PressHandler;
}
