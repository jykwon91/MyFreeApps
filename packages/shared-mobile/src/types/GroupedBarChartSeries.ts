/** One kind of bar in every group, such as "Revenue". */
export interface GroupedBarChartSeries {
  label: string;
  /**
   * A theme token, so the bar follows light and dark mode. Series are told apart by
   * more than hue (WCAG 1.4.1): pick colours at least 3:1 apart in luminance, and
   * 3:1 against the background (1.4.11), such as `chartPositive` and `chartNegative`.
   * The legend swatch repeats the same colour.
   */
  color: string;
}
