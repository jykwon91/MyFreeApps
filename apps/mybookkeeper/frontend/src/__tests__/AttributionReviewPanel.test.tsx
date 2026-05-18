import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { BrowserRouter } from "react-router-dom";
import { store } from "@/shared/store";
import AttributionReviewPanel from "@/app/features/attribution/AttributionReviewPanel";
import type { AttributionReviewQueueResponse } from "@/shared/types/attribution/attribution-review";

const emptyQueue: AttributionReviewQueueResponse = {
  items: [],
  total: 0,
  pending_count: 0,
};

const queueWithItems: AttributionReviewQueueResponse = {
  pending_count: 2,
  total: 2,
  items: [
    {
      id: "review-1",
      transaction_id: "txn-1",
      proposed_applicant_id: "app-1",
      proposed_property_id: null,
      confidence: "fuzzy",
      status: "pending",
      created_at: "2026-05-01T10:00:00Z",
      resolved_at: null,
      transaction: {
        id: "txn-1",
        transaction_date: "2026-05-01",
        amount: "1500.00",
        vendor: "Chase Bank",
        payer_name: "Alice Johnsn",
        description: "Zelle payment",
        property_id: null,
        channel: null,
      },
      proposed_applicant: {
        id: "app-1",
        legal_name: "Alice Johnson",
      },
      proposed_property: null,
    },
    {
      id: "review-2",
      transaction_id: "txn-2",
      proposed_applicant_id: null,
      proposed_property_id: null,
      confidence: "unmatched",
      status: "pending",
      created_at: "2026-05-02T10:00:00Z",
      resolved_at: null,
      transaction: {
        id: "txn-2",
        transaction_date: "2026-05-02",
        amount: "2000.00",
        vendor: null,
        payer_name: "John Mystery",
        description: null,
        property_id: null,
        channel: null,
      },
      proposed_applicant: null,
      proposed_property: null,
    },
  ],
};

vi.mock("@/shared/store/attributionApi", () => ({
  useGetAttributionReviewQueueQuery: vi.fn(),
  useConfirmAttributionReviewMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useRejectAttributionReviewMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useAttributeTransactionManuallyMutation: vi.fn(() => [
    vi.fn(() => ({ unwrap: () => Promise.resolve({ ok: true, transaction_id: "txn-2" }) })),
    { isLoading: false },
  ]),
}));

vi.mock("@/shared/store/applicantsApi", () => ({
  useGetApplicantsQuery: vi.fn(() => ({
    data: { items: [{ id: "applicant-9", legal_name: "Bob Tenant" }], total: 1, has_more: false },
    isLoading: false,
  })),
}));

import {
  useGetAttributionReviewQueueQuery,
} from "@/shared/store/attributionApi";

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <Provider store={store}>
      <BrowserRouter>{ui}</BrowserRouter>
    </Provider>,
  );
}

describe("AttributionReviewPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows skeleton while loading", () => {
    vi.mocked(useGetAttributionReviewQueueQuery).mockReturnValue({
      data: undefined,
      isLoading: true,
    } as unknown as ReturnType<typeof useGetAttributionReviewQueueQuery>);

    renderWithProviders(<AttributionReviewPanel />);
    // Skeleton renders divs with animate-pulse — check for its structure
    const skeletons = document.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("shows empty state when queue is empty", () => {
    vi.mocked(useGetAttributionReviewQueueQuery).mockReturnValue({
      data: emptyQueue,
      isLoading: false,
    } as unknown as ReturnType<typeof useGetAttributionReviewQueueQuery>);

    renderWithProviders(<AttributionReviewPanel />);
    expect(
      screen.getByText("All caught up — no payments need your review."),
    ).toBeInTheDocument();
  });

  it("renders pending items header with correct count", () => {
    vi.mocked(useGetAttributionReviewQueueQuery).mockReturnValue({
      data: queueWithItems,
      isLoading: false,
    } as unknown as ReturnType<typeof useGetAttributionReviewQueueQuery>);

    renderWithProviders(<AttributionReviewPanel />);
    expect(
      screen.getByText("Got 2 payments waiting for you to review."),
    ).toBeInTheDocument();
  });

  it("renders fuzzy match item with candidate name", () => {
    vi.mocked(useGetAttributionReviewQueueQuery).mockReturnValue({
      data: queueWithItems,
      isLoading: false,
    } as unknown as ReturnType<typeof useGetAttributionReviewQueueQuery>);

    renderWithProviders(<AttributionReviewPanel />);
    expect(screen.getByText(/Looks like/)).toBeInTheDocument();
    expect(screen.getByText("Alice Johnson")).toBeInTheDocument();
  });

  it("renders unmatched item with appropriate message", () => {
    vi.mocked(useGetAttributionReviewQueueQuery).mockReturnValue({
      data: queueWithItems,
      isLoading: false,
    } as unknown as ReturnType<typeof useGetAttributionReviewQueueQuery>);

    renderWithProviders(<AttributionReviewPanel />);
    expect(
      screen.getByText("Couldn't match this to any of your tenants."),
    ).toBeInTheDocument();
  });

  it("shows payer name as display name when available", () => {
    vi.mocked(useGetAttributionReviewQueueQuery).mockReturnValue({
      data: queueWithItems,
      isLoading: false,
    } as unknown as ReturnType<typeof useGetAttributionReviewQueueQuery>);

    renderWithProviders(<AttributionReviewPanel />);
    expect(screen.getByText("Alice Johnsn")).toBeInTheDocument();
    expect(screen.getByText("John Mystery")).toBeInTheDocument();
  });

  it("renders confirm button only for fuzzy match items", () => {
    vi.mocked(useGetAttributionReviewQueueQuery).mockReturnValue({
      data: queueWithItems,
      isLoading: false,
    } as unknown as ReturnType<typeof useGetAttributionReviewQueueQuery>);

    renderWithProviders(<AttributionReviewPanel />);
    const confirmButtons = screen.getAllByText("Yes, that's them");
    // Only the fuzzy item should have a confirm button
    expect(confirmButtons).toHaveLength(1);
  });

  it("renders not-them buttons for all items", () => {
    vi.mocked(useGetAttributionReviewQueueQuery).mockReturnValue({
      data: queueWithItems,
      isLoading: false,
    } as unknown as ReturnType<typeof useGetAttributionReviewQueueQuery>);

    renderWithProviders(<AttributionReviewPanel />);
    const rejectButtons = screen.getAllByText("Not them");
    expect(rejectButtons).toHaveLength(2);
  });

  it("renders inline tenant picker for unmatched items", () => {
    vi.mocked(useGetAttributionReviewQueueQuery).mockReturnValue({
      data: queueWithItems,
      isLoading: false,
    } as unknown as ReturnType<typeof useGetAttributionReviewQueueQuery>);

    renderWithProviders(<AttributionReviewPanel />);
    // Only the unmatched item gets a Link button + tenant select.
    expect(screen.getByRole("combobox", { name: /pick a tenant/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Bob Tenant" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Link$/ })).toBeInTheDocument();
  });

  it("does not render inline picker on fuzzy items", () => {
    // Show only the fuzzy item — picker should NOT appear.
    vi.mocked(useGetAttributionReviewQueueQuery).mockReturnValue({
      data: { ...queueWithItems, items: [queueWithItems.items[0]], pending_count: 1, total: 1 },
      isLoading: false,
    } as unknown as ReturnType<typeof useGetAttributionReviewQueueQuery>);

    renderWithProviders(<AttributionReviewPanel />);
    expect(screen.queryByRole("combobox", { name: /pick a tenant/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Link$/ })).not.toBeInTheDocument();
  });
});
