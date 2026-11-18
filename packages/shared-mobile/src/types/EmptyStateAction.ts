import type { PressHandler } from "./PressHandler";

export interface EmptyStateAction {
  label: string;
  onPress: PressHandler;
  isLoading?: boolean;
  /** Shown in place of the label while the action runs, as LoadingButton's `loadingText`. */
  loadingText?: string;
}
