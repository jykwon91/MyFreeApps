export interface SegmentedControlProps<Value extends string> {
  segments: readonly { value: Value; label: string }[];
  value: Value;
  onChange: (value: Value) => void;
  /** What the group is choosing between, for screen readers. */
  accessibilityLabel: string;
}
