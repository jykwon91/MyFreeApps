export interface EmptyStateAction {
  label: string;
  onPress: () => void | Promise<void>;
  isLoading?: boolean;
  /** Shown in place of the label while the action runs, as LoadingButton's `loadingText`. */
  loadingText?: string;
}
