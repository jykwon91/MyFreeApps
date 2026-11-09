import type { GroupedBarChartGroup } from "./GroupedBarChartGroup";
import type { GroupedBarChartSeries } from "./GroupedBarChartSeries";

export interface GroupedBarChartProps {
  series: readonly GroupedBarChartSeries[];
  groups: readonly GroupedBarChartGroup[];
  /** Height of the bars' area, not counting the labels and legend. */
  height: number;
  /** A summary of the whole chart, for screen readers. */
  accessibilityLabel: string;
  /** How a value reads on the side axis, such as "$4k". */
  formatValue?: (value: number) => string;
  testID?: string;
}
