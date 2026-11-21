import { fireEvent, render, screen } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";
import LoadMoreFooter from "../components/LoadMoreFooter";
import type { LoadMoreFooterProps } from "../types/LoadMoreFooterProps";

const MESSAGES: LoadMoreFooterProps["messages"] = {
  showingCount: (shown, total) => `Showing ${shown} of ${total}`,
  couldntLoadMore: "I couldn't load the rest of them.",
  loadingMore: "Loading more…",
  tryAgain: "Try again",
  loadMore: "Show more",
};

function footer(overrides: Partial<LoadMoreFooterProps> = {}) {
  return <LoadMoreFooter shown={50} total={120} isLoading={false} isError={false} onLoadMore={jest.fn()} messages={MESSAGES} {...overrides} />;
}

describe("LoadMoreFooter", () => {
  beforeEach(() => jest.clearAllMocks());

  it("says how many are showing and loads the next page on press", async () => {
    const onLoadMore = jest.fn();
    await render(footer({ onLoadMore }));

    expect(screen.getByText("Showing 50 of 120")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Show more" }));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it("shows the loading text while the next page loads", async () => {
    await render(footer({ isLoading: true }));
    expect(screen.getByText("Loading more…")).toBeTruthy();
  });

  it("alerts and offers Try again when the next page failed", async () => {
    await render(footer({ isError: true }));
    expect(screen.getByRole("alert")).toHaveTextContent("I couldn't load the rest of them.");
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("drops the alert while the retry is in flight", async () => {
    await render(footer({ isError: true, isLoading: true }));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("reads the count politely and the failure as an alert, on iOS as well as Android", async () => {
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
    const announcePolitely = jest.spyOn(AccessibilityInfo, "announceForAccessibilityWithOptions");
    await render(footer());
    expect(announcePolitely).toHaveBeenCalledWith("Showing 50 of 120", { queue: true });
    expect(announce).not.toHaveBeenCalled();

    await screen.rerender(footer({ isError: true }));
    expect(announce).toHaveBeenCalledWith("I couldn't load the rest of them.");
  });

  it("reads the failure again when a retry fails again", async () => {
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
    await render(footer({ isError: true }));
    await screen.rerender(footer({ isError: true, isLoading: true }));
    await screen.rerender(footer({ isError: true }));
    expect(announce).toHaveBeenCalledTimes(2);
  });
});
