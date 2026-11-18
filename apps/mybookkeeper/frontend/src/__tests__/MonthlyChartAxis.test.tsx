import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import MonthlyChart from "@/app/features/dashboard/MonthlyChart";

let yAxisFormatter: ((value: number) => string) | undefined;

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ComposedChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  YAxis: ({ tickFormatter }: { tickFormatter: (value: number) => string }) => {
    yAxisFormatter = tickFormatter;
    return null;
  },
  XAxis: () => null,
  Tooltip: () => null,
  Legend: () => null,
  Bar: () => null,
  Line: () => null,
}));

describe("MonthlyChart y-axis", () => {
  it("labels each tick exactly instead of rounding to whole thousands", () => {
    render(<MonthlyChart data={[]} />);
    expect(yAxisFormatter?.(2500)).toBe("$2.5k");
    expect(yAxisFormatter?.(750)).toBe("$750");
    expect(yAxisFormatter?.(1000)).toBe("$1k");
  });
});
