import { render, screen } from "@testing-library/react-native";
import SyncProgressBar from "../src/features/integrations/SyncProgressBar";

describe("SyncProgressBar", () => {
  it("is a single labelled progress bar with a spoken 'done of total'", async () => {
    await render(<SyncProgressBar done={3} total={10} />);
    const bars = screen.getAllByRole("progressbar");
    expect(bars).toHaveLength(1);
    expect(bars[0].props.accessible).toBe(true);
    expect(bars[0].props.accessibilityLabel).toBe("Sync progress");
    expect(bars[0].props.accessibilityValue).toEqual({ min: 0, max: 10, now: 3, text: "3 of 10" });
  });

  it("keeps the visible count out of the screen reader's reading order", async () => {
    await render(<SyncProgressBar done={3} total={10} />);
    expect(screen.queryByText("3 / 10")).toBeNull();
    expect(screen.getByText("3 / 10", { includeHiddenElements: true }).props.importantForAccessibility).toBe("no-hide-descendants");
  });
});
