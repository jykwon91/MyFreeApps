/** One cluster of bars, such as a month. */
export interface GroupedBarChartGroup {
  key: string;
  /** Short text under the group, such as "Mar". */
  label: string;
  /** One value per series, in the same order as the chart's series. */
  values: readonly number[];
  /** What a screen reader says for the group, with every value spelled out. */
  accessibilityLabel: string;
  onPress?: () => void;
}
