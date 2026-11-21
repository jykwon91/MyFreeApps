import { infiniteQueryData } from "@/test/rtk-infinite-query-data";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { store } from "@/shared/store";
import ReviewQueueDrawer from "@/app/features/calendar/ReviewQueueDrawer";
import type { ReviewQueueItem } from "@mybookkeeper/api-client/types/calendar/review-queue-item";

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const mockItems: ReviewQueueItem[] = [
  {
    id: "item-1",
    email_message_id: "msg-1",
    source_channel: "airbnb",
    parsed_payload: {
      source_channel: "airbnb",
      source_listing_id: "12345",
      guest_name: "John Smith",
      check_in: "2026-06-05",
      check_out: "2026-06-10",
      total_price: "$425.00",
      raw_subject: "Reservation confirmed - John Smith",
    },
    status: "pending",
    created_at: "2026-05-03T00:00:00Z",
  },
  {
    id: "item-2",
    email_message_id: "msg-2",
    source_channel: "furnished_finder",
    parsed_payload: {
      source_channel: "furnished_finder",
      source_listing_id: "FF-789",
      guest_name: "Sarah Johnson",
      check_in: "2026-07-01",
      check_out: "2026-07-31",
      total_price: "$2,200.00",
      raw_subject: "New Booking Request - Sarah Johnson",
    },
    status: "pending",
    created_at: "2026-05-03T01:00:00Z",
  },
];

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

let canWriteValue = true;
vi.mock("@/shared/hooks/useOrgRole", () => ({
  useCanWrite: () => canWriteValue,
}));

vi.mock("@mybookkeeper/api-client/store/calendarApi", () => ({
  useGetReviewQueueQuery: vi.fn(() => ({
    data: mockItems,
    isLoading: false,
    isError: false,
  })),
  useResolveQueueItemMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useIgnoreQueueItemMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useDismissQueueItemMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
}));

vi.mock("@mybookkeeper/api-client/store/listingsApi", () => ({
  useListListingPagesInfiniteQuery: vi.fn(() => ({
    ...infiniteQueryData({ items: [], total: 0, has_more: false }),
    isLoading: false,
    isFetching: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    isError: false,
    refetch: vi.fn(),
  })),
}));

import { useGetReviewQueueQuery } from "@mybookkeeper/api-client/store/calendarApi";

function renderDrawer(isOpen = true) {
  return render(
    <Provider store={store}>
      <ReviewQueueDrawer isOpen={isOpen} onClose={vi.fn()} />
    </Provider>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ReviewQueueDrawer", () => {
  function mockQuery(partial: { data?: ReviewQueueItem[]; isLoading?: boolean; isError?: boolean }) {
    vi.mocked(useGetReviewQueueQuery).mockReturnValue(
      partial as unknown as ReturnType<typeof useGetReviewQueueQuery>,
    );
  }

  beforeEach(() => {
    canWriteValue = true;
    mockQuery({ data: mockItems, isLoading: false, isError: false });
  });

  it("renders nothing when closed", () => {
    renderDrawer(false);
    expect(screen.queryByTestId("review-queue-drawer")).not.toBeInTheDocument();
  });

  it("renders the drawer when open", () => {
    renderDrawer();
    expect(screen.getByTestId("review-queue-drawer")).toBeInTheDocument();
  });

  it("renders all queue items", () => {
    renderDrawer();
    const items = screen.getAllByTestId("review-queue-item");
    expect(items).toHaveLength(mockItems.length);
  });

  it("renders a skeleton while loading", () => {
    mockQuery({ data: undefined, isLoading: true, isError: false });
    renderDrawer();
    expect(screen.getByTestId("review-queue-skeleton")).toBeInTheDocument();
    expect(screen.queryByTestId("review-queue-item")).not.toBeInTheDocument();
  });

  it("shows empty state when queue is empty", () => {
    mockQuery({ data: [], isLoading: false, isError: false });
    renderDrawer();
    expect(screen.getByText(/all clear/i)).toBeInTheDocument();
  });

  it("shows error message on fetch error", () => {
    mockQuery({ data: undefined, isLoading: false, isError: true });
    renderDrawer();
    expect(screen.getByText(/couldn't load/i)).toBeInTheDocument();
  });

  it("closes when the close button is clicked", () => {
    const onClose = vi.fn();
    render(
      <Provider store={store}>
        <ReviewQueueDrawer isOpen={true} onClose={onClose} />
      </Provider>,
    );
    fireEvent.click(screen.getByLabelText(/close review queue/i));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes when the backdrop is clicked", () => {
    const onClose = vi.fn();
    render(
      <Provider store={store}>
        <ReviewQueueDrawer isOpen={true} onClose={onClose} />
      </Provider>,
    );
    fireEvent.click(screen.getByTestId("review-queue-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("is a dialog named by its heading that holds focus and closes on Escape", async () => {
    const onClose = vi.fn();
    render(
      <Provider store={store}>
        <ReviewQueueDrawer isOpen={true} onClose={onClose} />
      </Provider>,
    );

    const dialog = screen.getByRole("dialog", { name: "Booking review queue" });
    expect(dialog).toHaveAccessibleDescription("Emails from channels that need a one-time decision");
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    await userEvent.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
