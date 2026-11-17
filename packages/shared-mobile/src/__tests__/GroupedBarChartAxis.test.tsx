import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { BarChart } from "react-native-gifted-charts";
import GroupedBarChart from "../components/GroupedBarChart";

jest.mock("react-native-gifted-charts", () => ({ BarChart: jest.fn(() => null) }));

const SERIES = [
  { label: "Revenue", color: "#0a0" },
  { label: "Expenses", color: "#a00" },
];

describe("GroupedBarChart axis", () => {
  it("hands the chart round gridlines, so labels match the lines", async () => {
    const formatValue = jest.fn((value: number) => `$${value}`);
    await render(
      <GroupedBarChart
        accessibilityLabel="Months"
        formatValue={formatValue}
        groups={[{ key: "a", label: "Jan", values: [2500, 100], accessibilityLabel: "Jan" }]}
        height={160}
        series={SERIES}
      />,
    );
    await act(async () => {
      fireEvent(screen.getByRole("image", { name: "Months" }), "layout", { nativeEvent: { layout: { width: 320, height: 160 } } });
    });
    const props = (BarChart as unknown as jest.Mock).mock.calls.at(-1)[0];
    expect(props.noOfSections).toBe(3);
    expect(props.stepValue).toBe(1000);
    expect(props.maxValue).toBe(3000);
    expect(formatValue).toHaveBeenCalledWith(3000);
  });
});
