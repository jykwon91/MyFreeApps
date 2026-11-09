import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import GroupedBarChart from "../components/GroupedBarChart";
import { MIN_TOUCH_TARGET } from "../theme/touchTarget";
import { lightColors } from "../theme/colors";
import type { GroupedBarChartGroup } from "../types/GroupedBarChartGroup";

const SERIES = [
  { label: "Revenue", color: lightColors.positiveText },
  { label: "Expenses", color: lightColors.destructiveText },
];

function aGroup(overrides: Partial<GroupedBarChartGroup> = {}): GroupedBarChartGroup {
  return { key: "2026-03", label: "Mar", values: [4200, 3100], accessibilityLabel: "Revenue 4,200, expenses 3,100, March", ...overrides };
}

async function renderChart(groups: GroupedBarChartGroup[], formatValue?: (value: number) => string) {
  await render(
    <GroupedBarChart accessibilityLabel="Two months" formatValue={formatValue} groups={groups} height={160} series={SERIES} testID="chart" />,
  );
  // Nothing is drawn until the chart knows how wide it is.
  await act(async () => {
    fireEvent(screen.getByRole("image", { name: "Two months" }), "layout", { nativeEvent: { layout: { width: 320, height: 160 } } });
  });
}

describe("GroupedBarChart", () => {
  it("is one image to a screen reader, summarised", async () => {
    await renderChart([aGroup(), aGroup({ key: "2026-04", label: "Apr" })]);
    expect(screen.getByRole("image", { name: "Two months" })).toBeTruthy();
  });

  it("reads and taps each group on its own", async () => {
    const onMarch = jest.fn();
    await renderChart([aGroup({ onPress: onMarch }), aGroup({ key: "2026-04", label: "Apr", accessibilityLabel: "April", onPress: jest.fn() })]);
    await fireEvent.press(screen.getByRole("button", { name: "Revenue 4,200, expenses 3,100, March" }));
    expect(onMarch).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Mar")).toBeTruthy();
    expect(screen.getByText("Apr")).toBeTruthy();
  });

  it("makes each group big enough to tap", async () => {
    await renderChart([aGroup({ onPress: jest.fn() })]);
    const style = StyleSheet.flatten(screen.getByRole("button", { name: /March/ }).props.style);
    expect(style.minHeight).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
  });

  it("doesn't offer a group as a button when it does nothing", async () => {
    await renderChart([aGroup()]);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("labels the series so colour isn't the only sign", async () => {
    await renderChart([aGroup()]);
    expect(screen.getByText("Revenue", { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText("Expenses", { includeHiddenElements: true })).toBeTruthy();
  });

  it("draws the axis in the format it's given", async () => {
    await renderChart([aGroup()], (value) => `$${value / 1000}k`);
    expect(screen.getAllByText(/^\$\d+(\.\d+)?k$/).length).toBeGreaterThan(0);
  });
});
