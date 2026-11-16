import type { ReactNode } from "react";

export interface LabelValueRowProps {
  label: string;
  value: string;
  labelSize?: "sm" | "md";
  valueSize?: "sm" | "md";
  labelTone?: "foreground" | "muted";
  valueTone?: "foreground" | "muted";
  valueWeight?: "400" | "500" | "600";
  /** Digits of equal width, so a column of amounts lines up. */
  tabularNums?: boolean;
  /** Where the value sits on the line when label and value share one. Stacked, the value always starts at the left. */
  valueAlign?: "start" | "end";
  /** Keeps labels in a column at least this wide while they share a line with their values. */
  labelMinWidth?: number;
  /** Lets a long value wrap. Left off for amounts, which must stay whole. */
  valueWraps?: boolean;
  /** Shown after the value, such as how it compares with something else. */
  trailing?: ReactNode;
  /** Defaults to the label then the value. */
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /** Turn off when a parent already reads the row as one element. */
  accessible?: boolean;
}
