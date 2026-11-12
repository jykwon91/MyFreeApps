export interface RetryPromptProps {
  prompt: string;
  /** While a turn is in flight. */
  disabled: boolean;
  onTry: () => void;
  onSkip: () => void;
}
