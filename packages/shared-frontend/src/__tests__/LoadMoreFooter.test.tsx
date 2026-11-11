import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LoadMoreFooter from "../components/ui/LoadMoreFooter";
import type { LoadMoreFooterProps } from "../types/load-more-footer-props";

const MESSAGES: LoadMoreFooterProps["messages"] = {
  showingCount: (shown, total) => `Showing ${shown} of ${total} things`,
  couldntLoadMore: "Couldn't load more things.",
  loadingMore: "Loading more things...",
  tryAgain: "Try again",
  loadMore: "Load more",
};

function footer(overrides: Partial<LoadMoreFooterProps> = {}) {
  return (
    <LoadMoreFooter
      shown={50}
      total={120}
      hasNextPage
      isLoading={false}
      isError={false}
      onLoadMore={vi.fn()}
      messages={MESSAGES}
      {...overrides}
    />
  );
}

describe("LoadMoreFooter", () => {
  it("renders nothing once every row is loaded", () => {
    const { container } = render(footer({ hasNextPage: false }));
    expect(container).toBeEmptyDOMElement();
  });

  it("says how many are showing, in the app's words, and loads the next page on press", async () => {
    const onLoadMore = vi.fn();
    render(footer({ onLoadMore }));

    expect(screen.getByText("Showing 50 of 120 things")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it("disables the button and shows the loading text while the next page loads", () => {
    render(footer({ isLoading: true }));
    expect(screen.getByRole("button", { name: /loading more things/i })).toBeDisabled();
  });

  it("alerts and offers Try again when the next page failed", () => {
    render(footer({ isError: true }));
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load more things.");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("drops the alert while the retry is in flight", () => {
    render(footer({ isError: true, isLoading: true }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
