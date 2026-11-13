/** A labelled row of toggle buttons in the design-knobs panel; one value is picked. */
export interface SegmentedProps<T extends string | number> {
  label: string;
  value: T;
  options: ReadonlyArray<{ label: string; value: T }>;
  onChange: (next: T) => void;
}
