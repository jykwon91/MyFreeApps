export interface ProgressBarProps {
  completed: number;
  total: number;
  /** What the bar measures, read out first by a screen reader. */
  accessibilityLabel: string;
  /** Spoken in place of the bare number, e.g. "3 of 10". */
  valueText?: string;
}
