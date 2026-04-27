import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { store } from "@/shared/store";
import Inquiries from "@/app/pages/Inquiries";
import type { InquirySummary } from "@/shared/types/inquiry/inquiry-summary";
import type { InquiryListResponse } from "@/shared/types/inquiry/inquiry-list-response";
import type { ListingListResponse } from "@/shared/types/listing/listing-list-response";

const mockInquiries: InquirySummary[] = [
  {
    id: "inq-1",
    source: "FF",
    listing_id: "listing-1",
    stage: "new",
    inquirer_name: "Alice Nguyen",
    inquirer_employer: "Texas Children's Hospital",
    desired_start_date: "2026-06-01",
    desired_end_date: "2026-08-31",
    gut_rating: null,
    received_at: "2026-04-25T10:00:00Z",
    last_message_preview: "Hello, I'm looking for a 3-month rental near TMC.",
    last_message_at: "2026-04-25T10:00:00Z",
  },
  {
    id: "inq-2",
    source: "TNH",
    listing_id: null,
    stage: "triaged",
    inquirer_name: "Bob Martin",
    inquirer_employer: null,
    desired_start_date: null,
    desired_end_date: null,
    gut_rating: null,
    received_at: "2026-04-20T14:00:00Z",
    last_message_preview: null,
    last_message_at: null,
  },
];

const mockEnvelope: InquiryListResponse = {
  items: mockInquiries,
  total: 2,
  has_more: false,
};

const mockListings: ListingListResponse = {
  items: [
    {
      id: "listing-1",
      title: "Garage Suite A",
      status: "active",
      room_type: "private_room",
      monthly_rate: "1799.00",
      property_id: "prop-1",
      created_at: "2026-01-01T00:00:00Z",
    },
  ],
  total: 1,
  has_more: false,
};

const defaultInquiriesState = {
  data: mockEnvelope,
  isLoading: false,
  isFetching: false,
  isError: false,
  refetch: vi.fn(),
};

const defaultListingsState = {
  data: mockListings,
  isLoading: false,
  isFetching: false,
  isError: false,
  refetch: vi.fn(),
};

const createInquiryMock = vi.fn(() => ({
  unwrap: () => Promise.resolve(mockInquiries[0]),
}));

vi.mock("@/shared/store/inquiriesApi", () => ({
  useGetInquiriesQuery: vi.fn(() => defaultInquiriesState),
  useGetInquiryByIdQuery: vi.fn(() => ({ data: undefined, isLoading: false })),
  useCreateInquiryMutation: vi.fn(() => [createInquiryMock, { isLoading: false }]),
  useUpdateInquiryMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useDeleteInquiryMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
}));

vi.mock("@/shared/store/listingsApi", () => ({
  useGetListingsQuery: vi.fn(() => defaultListingsState),
}));

import { useGetInquiriesQuery } from "@/shared/store/inquiriesApi";

type InquiriesQueryReturn = ReturnType<typeof useGetInquiriesQuery>;

function renderInquiries(initialEntries: string[] = ["/inquiries"]) {
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={initialEntries}>
        <Inquiries />
      </MemoryRouter>
    </Provider>,
  );
}

describe("Inquiries page", () => {
  beforeEach(() => {
    vi.mocked(useGetInquiriesQuery).mockReturnValue(
      defaultInquiriesState as unknown as InquiriesQueryReturn,
    );
    createInquiryMock.mockClear();
  });

  it("renders inquiries on both mobile and desktop layouts", () => {
    renderInquiries();
    expect(screen.getByTestId("inquiries-mobile")).toBeInTheDocument();
    expect(screen.getByTestId("inquiries-desktop")).toBeInTheDocument();
    expect(screen.getAllByText("Alice Nguyen").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Bob Martin").length).toBeGreaterThan(0);
  });

  it("shows the loading skeleton while fetching", () => {
    vi.mocked(useGetInquiriesQuery).mockReturnValueOnce({
      ...defaultInquiriesState,
      data: undefined,
      isLoading: true,
    } as unknown as InquiriesQueryReturn);
    renderInquiries();
    expect(screen.getByTestId("inquiries-skeleton")).toBeInTheDocument();
  });

  it("renders the unfiltered empty state when there are no inquiries", () => {
    vi.mocked(useGetInquiriesQuery).mockReturnValueOnce({
      ...defaultInquiriesState,
      data: { items: [], total: 0, has_more: false },
    } as unknown as InquiriesQueryReturn);
    renderInquiries();
    expect(screen.getByText(/No inquiries yet/i)).toBeInTheDocument();
  });

  it("renders the filtered empty state when no inquiries match the active stage", () => {
    vi.mocked(useGetInquiriesQuery).mockReturnValueOnce({
      ...defaultInquiriesState,
      data: { items: [], total: 0, has_more: false },
    } as unknown as InquiriesQueryReturn);
    renderInquiries(["/inquiries?stage=approved"]);
    expect(screen.getByText(/No inquiries in this stage/i)).toBeInTheDocument();
  });

  it("opens the InquiryForm slide-in when 'New inquiry' is clicked", async () => {
    const user = userEvent.setup();
    renderInquiries();
    await user.click(screen.getByTestId("new-inquiry-button"));
    expect(screen.getByTestId("inquiry-form")).toBeInTheDocument();
  });

  it("renders the source badge for each inquiry", () => {
    renderInquiries();
    expect(screen.getAllByTestId("source-badge-FF").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("source-badge-TNH").length).toBeGreaterThan(0);
  });

  it("renders an error AlertBox + retry button when the query errors", () => {
    vi.mocked(useGetInquiriesQuery).mockReturnValueOnce({
      ...defaultInquiriesState,
      isError: true,
    } as unknown as InquiriesQueryReturn);
    renderInquiries();
    expect(screen.getByText(/I couldn't load your inquiries/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Retry/i })).toBeInTheDocument();
  });

  it("hides 'Load more' when has_more is false", () => {
    renderInquiries();
    expect(screen.queryByRole("button", { name: /Load more/i })).not.toBeInTheDocument();
  });

  it("shows 'Load more' when has_more is true", () => {
    vi.mocked(useGetInquiriesQuery).mockReturnValueOnce({
      ...defaultInquiriesState,
      data: { ...mockEnvelope, has_more: true },
    } as unknown as InquiriesQueryReturn);
    renderInquiries();
    expect(screen.getByRole("button", { name: /Load more/i })).toBeInTheDocument();
  });

  it("changes the stage filter via URL state", async () => {
    const user = userEvent.setup();
    renderInquiries();
    await user.click(screen.getByTestId("inquiry-filter-triaged"));
    // After click, the chip should be aria-selected
    expect(screen.getByTestId("inquiry-filter-triaged")).toHaveAttribute("aria-selected", "true");
  });
});
