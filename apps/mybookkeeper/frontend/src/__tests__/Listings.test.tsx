import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { store } from "@/shared/store";
import Listings from "@/app/pages/Listings";
import type { ListingSummary } from "@/shared/types/listing/listing-summary";
import type { ListingListResponse } from "@/shared/types/listing/listing-list-response";
import type { Property } from "@/shared/types/property/property";

const mockListings: ListingSummary[] = [
  {
    id: "listing-1",
    title: "Garage Suite A",
    status: "active",
    room_type: "private_room",
    monthly_rate: "1799.00",
    property_id: "prop-1",
    created_at: "2026-01-01T00:00:00Z",
    slug: "garage-suite-a-abc123",
  },
  {
    id: "listing-2",
    title: "Upstairs Loft",
    status: "paused",
    room_type: "whole_unit",
    monthly_rate: "2400.00",
    property_id: "prop-1",
    created_at: "2026-01-05T00:00:00Z",
    slug: "upstairs-loft-def456",
  },
];

const mockEnvelope: ListingListResponse = {
  items: mockListings,
  total: mockListings.length,
  has_more: false,
};

const mockProperties: Property[] = [
  {
    id: "prop-1",
    name: "Med Center House",
    address: "123 Fannin, Houston, TX",
    classification: "investment",
    type: "long_term",
    is_active: true,
    activity_periods: [],
    created_at: "2025-01-01T00:00:00Z",
  },
];

interface QueryState<T> {
  data: T;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  refetch: () => void;
}

const defaultListingsState: QueryState<ListingListResponse> = {
  data: mockEnvelope,
  isLoading: false,
  isFetching: false,
  isError: false,
  refetch: vi.fn(),
};

const defaultPropertiesState = {
  data: mockProperties,
  isLoading: false,
};

const createListingMock = vi.fn(() => ({ unwrap: () => Promise.resolve(mockListings[0]) }));

vi.mock("@/shared/store/listingsApi", () => ({
  useGetListingsQuery: vi.fn(() => defaultListingsState),
  useGetListingByIdQuery: vi.fn(() => ({ data: undefined, isLoading: false })),
  useCreateListingMutation: vi.fn(() => [createListingMock, { isLoading: false }]),
  useUpdateListingMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useDeleteListingMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useUploadListingPhotosMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useDeleteListingPhotoMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useUpdateListingPhotoMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
}));

vi.mock("@/shared/store/propertiesApi", () => ({
  useGetPropertiesQuery: vi.fn(() => defaultPropertiesState),
}));

import { useGetListingsQuery } from "@/shared/store/listingsApi";

function renderListings(initialEntries: string[] = ["/listings"]) {
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={initialEntries}>
        <Listings />
      </MemoryRouter>
    </Provider>,
  );
}

describe("Listings page", () => {
  beforeEach(() => {
    vi.mocked(useGetListingsQuery).mockReturnValue(
      defaultListingsState as unknown as ReturnType<typeof useGetListingsQuery>,
    );
  });

  it("renders the page heading", () => {
    renderListings();
    expect(screen.getByRole("heading", { name: "Listings" })).toBeInTheDocument();
  });

  it("renders each listing's title", () => {
    renderListings();
    expect(screen.getAllByText("Garage Suite A").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Upstairs Loft").length).toBeGreaterThan(0);
  });

  it("resolves and renders the property name from the property id", () => {
    renderListings();
    // Property name should appear at least once per listing in mobile + desktop renders
    expect(screen.getAllByText("Med Center House").length).toBeGreaterThan(0);
  });

  it("shows the formatted monthly rate", () => {
    renderListings();
    expect(screen.getAllByText(/\$1,799\/mo/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/\$2,400\/mo/).length).toBeGreaterThan(0);
  });

  it("renders the room type label", () => {
    renderListings();
    expect(screen.getAllByText("Private Room").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Whole Unit").length).toBeGreaterThan(0);
  });

  it("renders both mobile and desktop layouts (responsive containers)", () => {
    renderListings();
    expect(screen.getByTestId("listings-mobile")).toBeInTheDocument();
    expect(screen.getByTestId("listings-desktop")).toBeInTheDocument();
  });

  it("shows a status filter row with All + each status", () => {
    renderListings();
    expect(screen.getByTestId("listing-filter-all")).toBeInTheDocument();
    expect(screen.getByTestId("listing-filter-active")).toBeInTheDocument();
    expect(screen.getByTestId("listing-filter-paused")).toBeInTheDocument();
    expect(screen.getByTestId("listing-filter-draft")).toBeInTheDocument();
    expect(screen.getByTestId("listing-filter-archived")).toBeInTheDocument();
  });

  it("updates the URL query string when a status chip is clicked", async () => {
    const user = userEvent.setup();
    renderListings();
    await user.click(screen.getByTestId("listing-filter-active"));
    // setSearchParams should reflect the active status — the chip is now selected
    expect(screen.getByTestId("listing-filter-active")).toHaveAttribute("aria-selected", "true");
  });

  it("renders the skeleton when loading", () => {
    vi.mocked(useGetListingsQuery).mockReturnValueOnce({
      ...defaultListingsState,
      data: undefined,
      isLoading: true,
    } as unknown as ReturnType<typeof useGetListingsQuery>);
    renderListings();
    expect(screen.getByTestId("listings-skeleton")).toBeInTheDocument();
  });

  it("renders the empty state message when no listings exist", () => {
    vi.mocked(useGetListingsQuery).mockReturnValueOnce({
      ...defaultListingsState,
      data: { items: [], total: 0, has_more: false },
    } as unknown as ReturnType<typeof useGetListingsQuery>);
    renderListings();
    expect(screen.getByText(/No listings yet/i)).toBeInTheDocument();
  });

  it("renders an inline error banner with a retry button on error", async () => {
    const refetchMock = vi.fn();
    vi.mocked(useGetListingsQuery).mockReturnValueOnce({
      ...defaultListingsState,
      data: { items: [], total: 0, has_more: false },
      isError: true,
      refetch: refetchMock,
    } as unknown as ReturnType<typeof useGetListingsQuery>);
    renderListings();
    expect(screen.getByText(/I couldn't load your listings/i)).toBeInTheDocument();
    const retryBtn = screen.getByRole("button", { name: /retry/i });
    const user = userEvent.setup();
    await user.click(retryBtn);
    expect(refetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to 'Unknown property' if the listing's property is not in the loaded set", () => {
    const orphan: ListingSummary = {
      ...mockListings[0],
      id: "orphan",
      property_id: "missing",
      title: "Orphan Listing",
    };
    vi.mocked(useGetListingsQuery).mockReturnValueOnce({
      ...defaultListingsState,
      data: { items: [orphan], total: 1, has_more: false },
    } as unknown as ReturnType<typeof useGetListingsQuery>);
    renderListings();
    expect(screen.getAllByText(/Unknown property/i).length).toBeGreaterThan(0);
  });

  it("renders the New listing button which opens the form", async () => {
    renderListings();
    const newBtn = screen.getByTestId("new-listing-button");
    expect(newBtn).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(newBtn);
    expect(screen.getByTestId("listing-form")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /new listing/i })).toBeInTheDocument();
  });

  it("hides the Load more button when has_more is false", () => {
    // Default mock has has_more: false
    renderListings();
    expect(screen.queryByRole("button", { name: /load more/i })).not.toBeInTheDocument();
  });

  it("shows the Load more button when has_more is true", () => {
    vi.mocked(useGetListingsQuery).mockReturnValueOnce({
      ...defaultListingsState,
      data: { items: mockListings, total: 50, has_more: true },
    } as unknown as ReturnType<typeof useGetListingsQuery>);
    renderListings();
    expect(screen.getByRole("button", { name: /load more/i })).toBeInTheDocument();
  });
});
