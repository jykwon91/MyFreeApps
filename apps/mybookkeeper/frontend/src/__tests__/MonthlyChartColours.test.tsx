import { afterEach, describe, it, expect, vi } from "vitest";
import { act, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { CHART_COLORS } from "@platform/core/constants/chartColors";
import MonthlyChart from "@/app/features/dashboard/MonthlyChart";

interface BarProps {
  name: string;
  fill: string;
}

let bars: BarProps[] = [];
let legendShown = false;

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ComposedChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  YAxis: () => null,
  XAxis: () => null,
  Tooltip: () => null,
  Legend: () => {
    legendShown = true;
    return null;
  },
  Bar: (props: BarProps) => {
    bars = [...bars.filter((b) => b.name !== props.name), props];
    return null;
  },
  Line: () => null,
}));

const fillOf = (name: string) => bars.find((b) => b.name === name)?.fill;

afterEach(() => {
  document.documentElement.classList.remove("dark");
  bars = [];
  legendShown = false;
});

describe("MonthlyChart colours", () => {
  it("names both series in a legend and draws them in the shared light colours", () => {
    render(<MonthlyChart data={[]} />);
    expect(legendShown).toBe(true);
    expect(fillOf("Revenue")).toBe(CHART_COLORS.light.positive);
    expect(fillOf("Expenses")).toBe(CHART_COLORS.light.negative);
  });

  it("uses the shared dark colours in dark mode, and follows a toggle", async () => {
    document.documentElement.classList.add("dark");
    render(<MonthlyChart data={[]} />);
    expect(fillOf("Revenue")).toBe(CHART_COLORS.dark.positive);

    await act(async () => {
      document.documentElement.classList.remove("dark");
      await Promise.resolve();
    });
    expect(fillOf("Revenue")).toBe(CHART_COLORS.light.positive);
    expect(fillOf("Expenses")).toBe(CHART_COLORS.light.negative);
  });
});
