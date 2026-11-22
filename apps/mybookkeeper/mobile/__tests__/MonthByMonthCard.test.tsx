import { lightColors } from "@platform/mobile";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import MonthByMonthCard from "../src/features/moneyAnalysis/MonthByMonthCard";
import type { AnalysisScope } from "../src/types/AnalysisScope";

jest.mock("expo-router", () => ({ router: { navigate: jest.fn(), push: jest.fn() } }));

const aMonth = (month: string, revenue: number, expenses: number) => ({ month, revenue, expenses, profit: revenue - expenses });
const SCOPE = { propertyId: null, period: "all" } as unknown as AnalysisScope;

describe("Money analysis month by month chart", () => {
  it("tells revenue and expenses apart by lightness, not just hue", async () => {
    await render(<MonthByMonthCard byMonth={[aMonth("2026-03", 4000, 1200), aMonth("2026-04", 3800, 900)]} byMonthExpense={[]} scope={SCOPE} />);
    await fireEvent(screen.getByRole("image"), "layout", { nativeEvent: { layout: { width: 320, height: 160 } } });
    const swatch = (label: string) =>
      StyleSheet.flatten(screen.getByTestId(`analysis-monthly-chart-legend-${label}`, { includeHiddenElements: true }).props.style).backgroundColor;
    expect(swatch("Revenue")).toBe(lightColors.chartPositive);
    expect(swatch("Expenses")).toBe(lightColors.chartNegative);
  });
});
