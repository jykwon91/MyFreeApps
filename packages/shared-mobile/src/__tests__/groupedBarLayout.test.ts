import { CHART_MAX_BAR_WIDTH, CHART_MIN_GROUP_GAP } from "../constants/groupedBarChart";
import { groupedBarLayout } from "../utils/groupedBarLayout";

function slotWidth(layout: ReturnType<typeof groupedBarLayout>, seriesCount: number): number {
  return layout.barWidth * seriesCount + layout.barGap * (seriesCount - 1) + layout.groupGap;
}

describe("groupedBarLayout", () => {
  it("fills one equal slot per group, so labels line up with the bars", () => {
    const layout = groupedBarLayout(300, 6, 2);
    expect(slotWidth(layout, 2)).toBeCloseTo(50, 5);
    expect(layout.initialSpacing).toBeCloseTo(layout.groupGap / 2, 5);
  });

  it("keeps the bars from getting fat when there's room, widening the gap instead", () => {
    const layout = groupedBarLayout(600, 2, 2);
    expect(layout.barWidth).toBe(CHART_MAX_BAR_WIDTH);
    expect(slotWidth(layout, 2)).toBeCloseTo(300, 5);
  });

  it("leaves at least the minimum gap between groups", () => {
    expect(groupedBarLayout(120, 6, 2).groupGap).toBeGreaterThanOrEqual(CHART_MIN_GROUP_GAP);
  });

  it("copes with nothing to draw yet", () => {
    expect(groupedBarLayout(0, 0, 0).barWidth).toBeGreaterThan(0);
  });
});
