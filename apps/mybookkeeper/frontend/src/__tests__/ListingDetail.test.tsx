import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { store } from "@/shared/store";
import ListingDetail from "@/app/pages/ListingDetail";
import type { ListingResponse } from "@/shared/types/listing/listing-response";
import type { Property } from "@/shared/types/property/property";

const mockListing: ListingResponse = {
  id: "listing-1",
  organization_id: "org-1",
  user_id: "user-1",
  property_id: "prop-1",
  title: "Garage Suite A",
  description: "Cozy private suite with separate entrance.",
  monthly_rate: "1799.00",
  weekly_rate: "550.00",
  nightly_rate: null,
  min_stay_days: 30,
  max_stay_days: 90,
  room_type: "private_room",
  private_bath: true,
  parking_assigned: true,
  furnished: true,
  status: "active",
  amenities: ["Wi-Fi", "Washer/Dryer", "Smart Lock"],
  pets_on_premises: false,
  large_dog_disclosure: null,
  photos: [],
  external_ids: [
    {
      id: "ext-1",
      listing_id: "listing-1",
      source: "FF",
      external_id: "FF-12345",
      external_url: "https://example.com/ff/12345",
      created_at: "2026-01-01T00:00:00Z",
    },
  ],
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const mockProperties: Property[] = [
  {
    id: "prop-1",
    name: "Med Center House",
    address: null,
    classification: "investment",
    type: "long_term",
    is_active: true,
    activity_periods: [],
    created_at: "2025-01-01T00:00:00Z",
  },
];

const deleteListingMock = vi.fn(() => ({ unwrap: () => Promise.resolve(undefined) }));

vi.mock("@/shared/store/listingsApi", () => ({
  useGetListingByIdQuery: vi.fn(),
  useGetListingsQuery: vi.fn(() => ({ data: { items: [], total: 0, has_more: false }, isLoading: false })),
  useCreateListingMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useUpdateListingMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useDeleteListingMutation: vi.fn(() => [deleteListingMock, { isLoading: false }]),
  useUploadListingPhotosMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useDeleteListingPhotoMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useUpdateListingPhotoMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useCreateListingExternalIdMutation: vi.fn(() => [vi.fn(() => ({ unwrap: () => Promise.resolve(undefined) })), { isLoading: false }]),
  useUpdateListingExternalIdMutation: vi.fn(() => [vi.fn(() => ({ unwrap: () => Promise.resolve(undefined) })), { isLoading: false }]),
  useDeleteListingExternalIdMutation: vi.fn(() => [vi.fn(() => ({ unwrap: () => Promise.resolve(undefined) })), { isLoading: false }]),
}));

vi.mock("@/shared/store/propertiesApi", () => ({
  useGetPropertiesQuery: vi.fn(() => ({ data: mockProperties, isLoading: false })),
}));

import { useGetListingByIdQuery } from "@/shared/store/listingsApi";

function renderDetail(listing: ListingResponse | undefined = mockListing, overrides: Partial<{ isLoading: boolean; isError: boolean; refetch: () => void }> = {}) {
  vi.mocked(useGetListingByIdQuery).mockReturnValue({
    data: listing,
    isLoading: overrides.isLoading ?? false,
    isFetching: false,
    isError: overrides.isError ?? false,
    refetch: overrides.refetch ?? vi.fn(),
  } as unknown as ReturnType<typeof useGetListingByIdQuery>);

  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[`/listings/${listing?.id ?? "missing"}`]}>
        <Routes>
          <Route path="/listings/:listingId" element={<ListingDetail />} />
          <Route path="/listings" element={<div>Listings page</div>} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
}

describe("ListingDetail page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the listing title and status badge", () => {
    renderDetail();
    expect(screen.getByRole("heading", { name: "Garage Suite A" })).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("renders the description", () => {
    renderDetail();
    expect(screen.getByText("Cozy private suite with separate entrance.")).toBeInTheDocument();
  });

  it("renders rates with the monthly rate as primary", () => {
    renderDetail();
    expect(screen.getAllByText(/\$1,799/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/\$550/).length).toBeGreaterThan(0);
  });

  it("does not render a nightly rate row when nightly_rate is null", () => {
    renderDetail();
    expect(screen.queryByText(/Nightly/i)).not.toBeInTheDocument();
  });

  it("renders the min/max stay window when present", () => {
    renderDetail();
    expect(screen.getByText(/Min stay: 30 days/)).toBeInTheDocument();
    expect(screen.getByText(/Max stay: 90 days/)).toBeInTheDocument();
  });

  it("renders the room details (room type, bath, parking, furnished)", () => {
    renderDetail();
    expect(screen.getByText("Private Room")).toBeInTheDocument();
    // Private bath: yes, parking: assigned, furnished: yes (multiple "Yes" allowed)
    expect(screen.getAllByText("Yes").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Assigned")).toBeInTheDocument();
  });

  it("renders all amenities as chips", () => {
    renderDetail();
    expect(screen.getByText("Wi-Fi")).toBeInTheDocument();
    expect(screen.getByText("Washer/Dryer")).toBeInTheDocument();
    expect(screen.getByText("Smart Lock")).toBeInTheDocument();
  });

  it("renders external IDs with the SourceBadge", () => {
    renderDetail();
    expect(screen.getByText("FF-12345")).toBeInTheDocument();
    expect(screen.getByTestId("source-badge-FF")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /open furnished finder/i });
    expect(link).toHaveAttribute("href", "https://example.com/ff/12345");
  });

  it("renders one ExternalIdRow per external_id row", () => {
    const withTwoExternalIds: ListingResponse = {
      ...mockListing,
      external_ids: [
        {
          id: "ext-1",
          listing_id: "listing-1",
          source: "FF",
          external_id: "FF-12345",
          external_url: "https://example.com/ff/12345",
          created_at: "2026-01-01T00:00:00Z",
        },
        {
          id: "ext-2",
          listing_id: "listing-1",
          source: "TNH",
          external_id: "TNH-9876",
          external_url: null,
          created_at: "2026-01-01T00:00:00Z",
        },
      ],
    };
    renderDetail(withTwoExternalIds);
    expect(screen.getByTestId("external-id-row-ext-1")).toBeInTheDocument();
    expect(screen.getByTestId("external-id-row-ext-2")).toBeInTheDocument();
    expect(screen.getByText("FF-12345")).toBeInTheDocument();
    expect(screen.getByText("TNH-9876")).toBeInTheDocument();
  });

  it("shows the External-ID empty state CTA when no external_ids exist", () => {
    const noExternalIds: ListingResponse = {
      ...mockListing,
      external_ids: [],
    };
    renderDetail(noExternalIds);
    expect(screen.getByTestId("external-id-empty-state")).toBeInTheDocument();
    expect(screen.getByTestId("external-id-add-cta")).toBeInTheDocument();
  });

  it("does NOT show the pet disclosure banner when pets_on_premises is false", () => {
    renderDetail();
    expect(screen.queryByTestId("pet-disclosure-banner")).not.toBeInTheDocument();
  });

  it("DOES show the pet disclosure banner when pets_on_premises is true and renders the disclosure text", () => {
    const withPets: ListingResponse = {
      ...mockListing,
      pets_on_premises: true,
      large_dog_disclosure: "Rottweiler on premises — friendly but large.",
    };
    renderDetail(withPets);
    const banner = screen.getByTestId("pet-disclosure-banner");
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent("Rottweiler on premises");
  });

  it("shows the pet banner with a generic message when pets_on_premises is true but no disclosure text", () => {
    const withPets: ListingResponse = {
      ...mockListing,
      pets_on_premises: true,
      large_dog_disclosure: null,
    };
    renderDetail(withPets);
    expect(screen.getByTestId("pet-disclosure-banner")).toHaveTextContent(/pets live at this property/i);
  });

  it("renders the photo manager empty state when there are no photos", () => {
    renderDetail();
    expect(screen.getByTestId("listing-photo-empty-state")).toBeInTheDocument();
  });

  it("renders the photo manager grid when photos exist", () => {
    const withPhotos: ListingResponse = {
      ...mockListing,
      photos: [
        { id: "p1", listing_id: "listing-1", storage_key: "key-1", caption: null, display_order: 0, created_at: "2026-01-01T00:00:00Z" },
        { id: "p2", listing_id: "listing-1", storage_key: "key-2", caption: "Front view", display_order: 1, created_at: "2026-01-01T00:00:00Z" },
      ],
    };
    renderDetail(withPhotos);
    expect(screen.getByTestId("listing-photo-grid")).toBeInTheDocument();
    expect(screen.queryByTestId("listing-photo-empty-state")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("listing-photo-card")).toHaveLength(2);
  });

  it("renders an enabled Edit button that opens the edit form", async () => {
    renderDetail();
    const editBtn = screen.getByTestId("edit-listing-button");
    expect(editBtn).not.toBeDisabled();
    const user = userEvent.setup();
    await user.click(editBtn);
    expect(screen.getByTestId("listing-form")).toBeInTheDocument();
    // Edit-form heading should be rendered.
    expect(screen.getByRole("heading", { name: /edit listing/i })).toBeInTheDocument();
  });

  it("renders the Delete button which opens a confirmation modal", async () => {
    renderDetail();
    const deleteBtn = screen.getByTestId("delete-listing-button");
    expect(deleteBtn).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(deleteBtn);
    expect(screen.getByText(/Delete this listing\?/i)).toBeInTheDocument();
  });

  it("calls the delete mutation when the user confirms the modal", async () => {
    deleteListingMock.mockClear();
    renderDetail();
    const user = userEvent.setup();
    await user.click(screen.getByTestId("delete-listing-button"));
    await user.click(screen.getByRole("button", { name: /^delete$/i }));
    expect(deleteListingMock).toHaveBeenCalledWith("listing-1");
  });

  it("renders the back link to the listings page", () => {
    renderDetail();
    const link = screen.getByRole("link", { name: /back to listings/i });
    expect(link).toHaveAttribute("href", "/listings");
  });

  it("renders the skeleton while loading", () => {
    renderDetail(undefined, { isLoading: true });
    expect(screen.getByTestId("listing-detail-skeleton")).toBeInTheDocument();
  });

  it("renders an inline error banner with retry on error", async () => {
    const refetchMock = vi.fn();
    renderDetail(undefined, { isError: true, refetch: refetchMock });
    expect(screen.getByText(/I couldn't load this listing/i)).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /retry/i }));
    expect(refetchMock).toHaveBeenCalledTimes(1);
  });
});
