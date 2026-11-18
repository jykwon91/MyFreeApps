import type { PressHandler } from "./PressHandler";

export interface SectionErrorProps {
  message: string;
  retryLabel: string;
  onRetry: PressHandler;
}
