import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { store } from "@/shared/store";
import ReviewQueueItem from "@/app/features/calendar/ReviewQueueItem";
import type { ReviewQueueItem as ReviewQueueItemType } from "@/shared/types/calendar/review-queue-item";

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const mockItem: ReviewQueueItemType = {
  id: "item-1",
  email_message_id: "msg-airbnb-1",
  source_channel: "airbnb",
  parsed_payload: {
    source_channel: "airbnb",
    source_listing_id: "12345",
    guest_name: "John Smith",
    check_in: "2026-06-05",
    check_out: "2026-06-10",
    total_price: "$425.00",
    raw_subject: "Reservation confirmed - John Smith (Jun 5 - Jun 10)",
  },
  status: "pending",
  created_at: "2026-05-03T00:00:00Z",
};

const mockItemNoListingId: ReviewQueueItemType = {
  ...mockItem,
  id: "item-no-lid",
  parsed_payload: { ...mockItem.parsed_payload, source_listing_id: null },
};

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockResolve = vi.fn().mockResolvedValue({});
const mockIgnore = vi.fn().mockResolvedValue({});
const mockDismiss = vi.fn().mockResolvedValue({});

vi.mock("@/shared/store/calendarApi", () => ({
  useResolveQueueItemMutation: vi.fn(() => [
    mockResolve,
    { isLoading: false },
  ]),
  useIgnoreQueueItemMutation: vi.fn(() => [
    mockIgnore,
    { isLoading: false },
  ]),
  useDismissQueueItemMutation: vi.fn(() => [
    mockDismiss,
    { isLoading: false },
  ]),
}));

vi.mock("@/shared/store/listingsApi", () => ({
  useGetListingsQuery: vi.fn(() => ({
    data: {
      items: [
        { id: "listing-1", title: "Master Bedroom", status: "active", room_type: "private_room", monthly_rate: "1500", property_id: "prop-1", created_at: "2026-01-01" },
      ],
      total: 1,
      has_more: false,
    },
    isLoading: false,
  })),
}));

import {
  useResolveQueueItemMutation,
  useIgnoreQueueItemMutation,
  useDismissQueueItemMutation,
} from "@/shared/store/calendarApi";

function renderItem(item = mockItem) {
  return render(
    <Provider store={store}>
      <ReviewQueueItem item={item} />
    </Provider>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ReviewQueueItem", () => {
  beforeEach(() => {
    vi.mocked(useResolveQueueItemMutation).mockReturnValue([
      mockResolve,
      { isLoading: false } as unknown as ReturnType<typeof useResolveQueueItemMutation>[1],
    ]);
    vi.mocked(useIgnoreQueueItemMutation).mockReturnValue([
      mockIgnore,
      { isLoading: false } as unknown as ReturnType<typeof useIgnoreQueueItemMutation>[1],
    ]);
    vi.mocked(useDismissQueueItemMutation).mockReturnValue([
      mockDismiss,
      { isLoading: false } as unknown as ReturnType<typeof useDismissQueueItemMutation>[1],
    ]);
    mockResolve.mockClear();
    mockIgnore.mockClear();
    mockDismiss.mockClear();
  });

  it("renders the channel badge", () => {
    renderItem();
    expect(screen.getByTestId("channel-badge-airbnb")).toBeInTheDocument();
  });

  it("renders the email subject", () => {
    renderItem();
    expect(screen.getByTestId("review-queue-subject")).toHaveTextContent(
      /Reservation confirmed/i,
    );
  });

  it("renders guest name, dates, and price", () => {
    renderItem();
    expect(screen.getByTestId("review-queue-guest")).toHaveTextContent("John Smith");
    expect(screen.getByTestId("review-queue-dates")).toBeInTheDocument();
    expect(screen.getByTestId("review-queue-price")).toHaveTextContent("$425.00");
  });

  it("renders Add to MBK and Ignore forever buttons", () => {
    renderItem();
    expect(screen.getByTestId("review-queue-add-btn")).toBeInTheDocument();
    expect(screen.getByTestId("review-queue-ignore-btn")).toBeInTheDocument();
  });

  it("expands listing picker when Add to MBK is clicked", async () => {
    renderItem();
    expect(screen.queryByTestId("review-queue-resolve-panel")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("review-queue-add-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("review-queue-resolve-panel")).toBeInTheDocument();
    });
    expect(screen.getByTestId("review-queue-listing-select")).toBeInTheDocument();
  });

  it("confirm button is disabled when no listing is selected", async () => {
    renderItem();
    fireEvent.click(screen.getByTestId("review-queue-add-btn"));
    await waitFor(() => screen.getByTestId("review-queue-resolve-panel"));

    // Confirm is disabled until a listing is chosen — guards against accidental submit.
    expect(screen.getByTestId("review-queue-confirm-btn")).toBeDisabled();
    expect(mockResolve).not.toHaveBeenCalled();
  });

  it("calls resolveItem when listing selected and confirmed", async () => {
    mockResolve.mockReturnValueOnce({ unwrap: () => Promise.resolve({}) });
    renderItem();
    fireEvent.click(screen.getByTestId("review-queue-add-btn"));
    await waitFor(() => screen.getByTestId("review-queue-listing-select"));

    const select = screen.getByTestId("review-queue-listing-select");
    fireEvent.change(select, { target: { value: "listing-1" } });

    fireEvent.click(screen.getByTestId("review-queue-confirm-btn"));

    await waitFor(() => {
      expect(mockResolve).toHaveBeenCalledWith({
        itemId: mockItem.id,
        body: { listing_id: "listing-1" },
      });
    });
  });

  it("calls ignoreItem when Ignore forever is clicked", async () => {
    mockIgnore.mockReturnValueOnce({ unwrap: () => Promise.resolve({}) });
    renderItem();

    fireEvent.click(screen.getByTestId("review-queue-ignore-btn"));

    await waitFor(() => {
      expect(mockIgnore).toHaveBeenCalledWith({
        itemId: mockItem.id,
        body: expect.objectContaining({ source_listing_id: "12345" }),
      });
    });
  });

  it("uses email_message_id as source_listing_id fallback when null", async () => {
    mockIgnore.mockReturnValueOnce({ unwrap: () => Promise.resolve({}) });
    renderItem(mockItemNoListingId);

    fireEvent.click(screen.getByTestId("review-queue-ignore-btn"));

    await waitFor(() => {
      expect(mockIgnore).toHaveBeenCalledWith({
        itemId: mockItemNoListingId.id,
        body: expect.objectContaining({
          source_listing_id: mockItemNoListingId.email_message_id,
        }),
      });
    });
  });

  it("calls dismissItem when Dismiss is clicked", async () => {
    mockDismiss.mockReturnValueOnce({ unwrap: () => Promise.resolve({}) });
    renderItem();

    fireEvent.click(screen.getByTestId("review-queue-dismiss-btn"));

    await waitFor(() => {
      expect(mockDismiss).toHaveBeenCalledWith(mockItem.id);
    });
  });

  it("shows an error on resolve API failure", async () => {
    mockResolve.mockReturnValueOnce({
      unwrap: () => Promise.reject(new Error("API error")),
    });
    renderItem();
    fireEvent.click(screen.getByTestId("review-queue-add-btn"));
    await waitFor(() => screen.getByTestId("review-queue-listing-select"));

    const select = screen.getByTestId("review-queue-listing-select");
    fireEvent.change(select, { target: { value: "listing-1" } });
    fireEvent.click(screen.getByTestId("review-queue-confirm-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("review-queue-error")).toBeInTheDocument();
    });
  });
});

describe("ReviewQueueItem — skeleton matches loaded structure", () => {
  it("renders a card with correct ARIA roles", () => {
    renderItem();
    expect(screen.getByRole("article")).toBeInTheDocument();
    // Must have at least two interactive buttons
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThanOrEqual(2);
  });
});
