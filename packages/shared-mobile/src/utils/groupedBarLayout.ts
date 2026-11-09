import { CHART_BAR_GAP, CHART_MAX_BAR_WIDTH, CHART_MIN_GROUP_GAP } from "../constants/groupedBarChart";
import type { GroupedBarLayout } from "../types/GroupedBarLayout";

/**
 * Splits the plot into one equal slot per group. Labels and tap targets are laid
 * over the same slots, so the bars have to fill them exactly: when the bars hit
 * their widest, the spare room goes into the gap between groups.
 */
export function groupedBarLayout(plotWidth: number, groupCount: number, seriesCount: number): GroupedBarLayout {
  const slot = plotWidth / Math.max(groupCount, 1);
  const barsAndGaps = Math.max(seriesCount, 1);
  const innerGaps = (barsAndGaps - 1) * CHART_BAR_GAP;
  const barWidth = Math.max(1, Math.min(CHART_MAX_BAR_WIDTH, (slot - CHART_MIN_GROUP_GAP - innerGaps) / barsAndGaps));
  const groupGap = slot - barWidth * barsAndGaps - innerGaps;
  return { barWidth, barGap: CHART_BAR_GAP, groupGap, initialSpacing: groupGap / 2 };
}
