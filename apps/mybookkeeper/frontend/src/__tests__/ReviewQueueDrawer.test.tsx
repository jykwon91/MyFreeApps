import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { store } from "@/shared/store";
import ReviewQueueDrawer from "@/app/features/calendar/ReviewQueueDrawer";
import type { ReviewQueueItem } from "@/shared/types/calendar/review-queue-item";

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

vi.mock("@/shared/store/calendarApi", () => ({
  useGetReviewQueueQuery: vi.fn(() => ({
    data: mockItems,
    isLoading: false,
    isError: false,
  })),
  useResolveQueueItemMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useIgnoreQueueItemMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useDismissQueueItemMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
}));

vi.mock("@/shared/store/listingsApi", () => ({
  useGetListingsQuery: vi.fn(() => ({
    data: { items: [], total: 0, has_more: false },
    isLoading: false,
  })),
}));

import { useGetReviewQueueQuery } from "@/shared/store/calendarApi";

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
  beforeEach(() => {
    vi.mocked(useGetReviewQueueQuery).mockReturnValue({
      data: mockItems,
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useGetReviewQueueQuery>);
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
    vi.mocked(useGetReviewQueueQuery).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as ReturnType<typeof useGetReviewQueueQuery>);
    renderDrawer();
    expect(screen.getByTestId("review-queue-skeleton")).toBeInTheDocument();
    expect(screen.queryByTestId("review-queue-item")).not.toBeInTheDocument();
  });

  it("shows empty state when queue is empty", () => {
    vi.mocked(useGetReviewQueueQuery).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useGetReviewQueueQuery>);
    renderDrawer();
    expect(screen.getByText(/all clear/i)).toBeInTheDocument();
  });

  it("shows error message on fetch error", () => {
    vi.mocked(useGetReviewQueueQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as ReturnType<typeof useGetReviewQueueQuery>);
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
});
