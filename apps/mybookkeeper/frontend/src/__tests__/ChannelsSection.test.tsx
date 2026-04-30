import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ChannelsSection from "@/app/features/listings/ChannelsSection";
import type { ChannelListing } from "@/shared/types/listing/channel-listing";
import type { Channel } from "@/shared/types/listing/channel";

const showSuccessMock = vi.fn();
const showErrorMock = vi.fn();

vi.mock("@/shared/lib/toast-store", () => ({
  showError: (msg: string) => showErrorMock(msg),
  showSuccess: (msg: string) => showSuccessMock(msg),
}));

const deleteMutationMock = vi.fn();
const createMutationMock = vi.fn();
const updateMutationMock = vi.fn();

let mockChannels: Channel[] = [];
let mockChannelListings: ChannelListing[] = [];
let mockIsLoading = false;
let mockIsError = false;

vi.mock("@/shared/store/listingsApi", () => ({
  useGetChannelsQuery: vi.fn(() => ({ data: mockChannels })),
  useGetListingChannelsQuery: vi.fn(() => ({
    data: mockChannelListings,
    isLoading: mockIsLoading,
    isError: mockIsError,
    refetch: vi.fn(),
  })),
  useDeleteChannelListingMutation: vi.fn(() => [
    deleteMutationMock,
    { isLoading: false },
  ]),
  useCreateListingChannelMutation: vi.fn(() => [
    createMutationMock,
    { isLoading: false },
  ]),
  useUpdateChannelListingMutation: vi.fn(() => [
    updateMutationMock,
    { isLoading: false },
  ]),
}));

const airbnb: Channel = {
  id: "airbnb",
  name: "Airbnb",
  supports_ical_export: true,
  supports_ical_import: true,
  created_at: "2026-01-01T00:00:00Z",
};
const vrbo: Channel = { ...airbnb, id: "vrbo", name: "VRBO" };

const cl: ChannelListing = {
  id: "cl-1",
  listing_id: "listing-1",
  channel_id: "airbnb",
  channel: airbnb,
  external_url: "https://airbnb.com/rooms/12345",
  external_id: "12345",
  ical_import_url: "https://airbnb.com/calendar/ical/12345.ics",
  last_imported_at: new Date().toISOString(),
  last_import_error: null,
  ical_export_token: "token-xyz",
  ical_export_url: "https://example.com/api/calendar/token-xyz.ics",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("ChannelsSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChannels = [airbnb, vrbo];
    mockChannelListings = [];
    mockIsLoading = false;
    mockIsError = false;
  });

  it("shows loading skeletons while fetching", () => {
    mockIsLoading = true;
    render(<ChannelsSection listingId="listing-1" />);
    expect(screen.getByTestId("channels-section-loading")).toBeInTheDocument();
  });

  it("shows the empty state with CTA when no channel_listings exist", () => {
    render(<ChannelsSection listingId="listing-1" />);
    expect(
      screen.getByTestId("channels-section-empty-state"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("channels-section-add-cta")).toBeInTheDocument();
  });

  it("renders one row per channel_listing", () => {
    mockChannelListings = [cl];
    render(<ChannelsSection listingId="listing-1" />);
    expect(screen.getByTestId("channel-listings-list")).toBeInTheDocument();
    expect(screen.getByTestId("channel-listing-row-cl-1")).toBeInTheDocument();
    expect(screen.getByText("Airbnb")).toBeInTheDocument();
  });

  it('opens the modal when "Add channel" is clicked', async () => {
    mockChannelListings = [cl];
    render(<ChannelsSection listingId="listing-1" />);
    expect(
      screen.queryByTestId("channel-listing-form-modal"),
    ).not.toBeInTheDocument();

    await userEvent.setup().click(screen.getByTestId("channels-section-add-button"));
    expect(screen.getByTestId("channel-listing-form-modal")).toBeInTheDocument();
  });

  it("hides the Add button when all channels are linked", () => {
    const both: ChannelListing[] = [
      cl,
      { ...cl, id: "cl-2", channel_id: "vrbo", channel: vrbo },
    ];
    mockChannelListings = both;
    render(<ChannelsSection listingId="listing-1" />);
    expect(
      screen.queryByTestId("channels-section-add-button"),
    ).not.toBeInTheDocument();
  });

  it("calls delete mutation and shows success toast on remove", async () => {
    mockChannelListings = [cl];
    deleteMutationMock.mockReturnValue({
      unwrap: () => Promise.resolve(undefined),
    });

    render(<ChannelsSection listingId="listing-1" />);
    await userEvent.setup().click(screen.getByTestId("channel-listing-remove-cl-1"));

    await waitFor(() => {
      expect(deleteMutationMock).toHaveBeenCalledWith({
        listingId: "listing-1",
        channelListingId: "cl-1",
      });
      expect(showSuccessMock).toHaveBeenCalled();
    });
  });

  it("shows error toast when remove fails", async () => {
    mockChannelListings = [cl];
    deleteMutationMock.mockReturnValue({
      unwrap: () => Promise.reject(new Error("network")),
    });

    render(<ChannelsSection listingId="listing-1" />);
    await userEvent.setup().click(screen.getByTestId("channel-listing-remove-cl-1"));

    await waitFor(() => {
      expect(showErrorMock).toHaveBeenCalled();
    });
  });
});
