export interface GroupedBarLayout {
  barWidth: number;
  /** Between bars in the same group. */
  barGap: number;
  /** Between the last bar of a group and the first of the next. */
  groupGap: number;
  /** Before the first group: half a gap, so every group is centred in an equal slot. */
  initialSpacing: number;
}
