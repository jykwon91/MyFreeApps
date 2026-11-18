import { render, screen } from "@testing-library/react-native";
import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import type { ReactTestInstance } from "react-test-renderer";
import ProgressBar from "../components/ProgressBar";

function fillWidth(): unknown {
  const [fill] = screen.getByRole("progressbar").children as unknown as ReactTestInstance[];
  return StyleSheet.flatten(fill.props.style as StyleProp<ViewStyle>)?.width;
}

describe("ProgressBar", () => {
  it("is one labelled progress bar with min, max, now and a spoken value", async () => {
    await render(<ProgressBar accessibilityLabel="Sync progress" completed={3} total={10} valueText="3 of 10" />);
    const bars = screen.getAllByRole("progressbar");
    expect(bars).toHaveLength(1);
    expect(bars[0].props.accessible).toBe(true);
    expect(bars[0].props.accessibilityLabel).toBe("Sync progress");
    expect(bars[0].props.accessibilityValue).toEqual({ min: 0, max: 10, now: 3, text: "3 of 10" });
  });

  it("fills in proportion to what is done", async () => {
    await render(<ProgressBar accessibilityLabel="x" completed={3} total={10} />);
    expect(fillWidth()).toBe("30%");
  });

  it("never overfills or divides by zero", async () => {
    await render(<ProgressBar accessibilityLabel="x" completed={12} total={10} />);
    expect(fillWidth()).toBe("100%");
    await render(<ProgressBar accessibilityLabel="y" completed={0} total={0} />);
    expect(fillWidth()).toBe("0%");
  });
});
