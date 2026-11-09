import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ChannelsSection from "@/app/features/listings/ChannelsSection";
import type { ChannelListing } from "@mybookkeeper/api-client/types/listing/channel-listing";
import type { Channel } from "@mybookkeeper/api-client/types/listing/channel";
import { LISTING_MESSAGES } from "@/shared/lib/listing-messages";
import { queryStatus } from "@/test/rtk-query-status";

const showSuccessMock = vi.fn();
const showErrorMock = vi.fn();

vi.mock("@platform/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@platform/ui")>()),
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
let mockIsFetching = false;
let mockChannelsFailed = false;
let mockChannelsFetching = false;
const refetchChannelListings = vi.fn();
const refetchChannels = vi.fn();

vi.mock("@mybookkeeper/api-client/store/listingsApi", () => ({
  useGetChannelsQuery: vi.fn(() => ({
    data: mockChannelsFailed ? undefined : mockChannels,
    ...queryStatus({ failed: mockChannelsFailed, fetching: mockChannelsFetching }),
    refetch: refetchChannels,
  })),
  useGetListingChannelsQuery: vi.fn(() => ({
    data: mockIsLoading || mockIsError ? undefined : mockChannelListings,
    isLoading: mockIsLoading,
    ...queryStatus({ failed: mockIsError, fetching: mockIsLoading || mockIsFetching }),
    refetch: refetchChannelListings,
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
    mockIsFetching = false;
    mockChannelsFailed = false;
    mockChannelsFetching = false;
  });

  it("shows loading skeletons while fetching", () => {
    mockIsLoading = true;
    render(<ChannelsSection canWrite listingId="listing-1" />);
    expect(screen.getByTestId("channels-section-loading")).toBeInTheDocument();
  });

  it("shows the load error with Retry, not the empty pitch, when the links fail to load", async () => {
    mockIsError = true;
    render(<ChannelsSection canWrite listingId="listing-1" />);
    expect(screen.getByText("I couldn't load the channels for this listing.")).toBeInTheDocument();
    expect(screen.queryByTestId("channels-section-empty-state")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetchChannelListings).toHaveBeenCalledTimes(1);
  });

  it("keeps the load error, not the empty pitch, while Retry refetches", () => {
    mockIsError = true;
    mockIsFetching = true;
    render(<ChannelsSection canWrite listingId="listing-1" />);
    expect(screen.getByText("I couldn't load the channels for this listing.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retrying..." })).toBeDisabled();
    expect(screen.queryByTestId("channels-section-empty-state")).not.toBeInTheDocument();
  });

  it("says why adding is unavailable when the channel list fails to load", async () => {
    mockChannelsFailed = true;
    render(<ChannelsSection canWrite listingId="listing-1" />);
    expect(
      screen.getByText("I couldn't load the channels you can link, so adding one isn't available right now."),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("channels-section-add-cta")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetchChannels).toHaveBeenCalledTimes(1);
  });

  it("doesn't warn a viewer that adding is unavailable", () => {
    mockChannelsFailed = true;
    render(<ChannelsSection canWrite={false} listingId="listing-1" />);
    expect(screen.queryByText(/so adding one isn't available/)).not.toBeInTheDocument();
  });

  it("shows the empty state with CTA when no channel_listings exist", () => {
    render(<ChannelsSection canWrite listingId="listing-1" />);
    expect(
      screen.getByTestId("channels-section-empty-state"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("channels-section-add-cta")).toBeInTheDocument();
  });

  it("renders one row per channel_listing", () => {
    mockChannelListings = [cl];
    render(<ChannelsSection canWrite listingId="listing-1" />);
    expect(screen.getByTestId("channel-listings-list")).toBeInTheDocument();
    expect(screen.getByTestId("channel-listing-row-cl-1")).toBeInTheDocument();
    expect(screen.getByText("Airbnb")).toBeInTheDocument();
  });

  it('opens the modal when "Add channel" is clicked', async () => {
    mockChannelListings = [cl];
    render(<ChannelsSection canWrite listingId="listing-1" />);
    expect(
      screen.queryByTestId("channel-listing-form-modal"),
    ).not.toBeInTheDocument();

    await userEvent.setup().click(screen.getByTestId("channels-section-add-button"));
    expect(screen.getByTestId("channel-listing-form-modal")).toBeInTheDocument();
  });

  it("opens the edit form for a row, then the add form fresh after closing it", async () => {
    mockChannelListings = [cl];
    const user = userEvent.setup();
    render(<ChannelsSection canWrite listingId="listing-1" />);

    await user.click(screen.getByTestId("channel-listing-edit-cl-1"));
    expect(screen.getByText("Edit channel link")).toBeInTheDocument();
    expect(screen.getByDisplayValue("https://airbnb.com/rooms/12345")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByTestId("channel-listing-form-modal")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("channels-section-add-button"));
    expect(screen.getByText("Add a channel")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("https://airbnb.com/rooms/12345")).not.toBeInTheDocument();
    expect(screen.queryByTestId("channels-section-add-button")).not.toBeInTheDocument();
  });

  it("gives a viewer the channels with copy but no add, edit or remove", () => {
    mockChannelListings = [cl];
    render(<ChannelsSection canWrite={false} listingId="listing-1" />);
    expect(screen.getByTestId("channel-listing-row-cl-1")).toBeInTheDocument();
    expect(screen.getByTestId("channel-listing-copy-cl-1")).toBeInTheDocument();
    expect(screen.queryByTestId("channel-listing-edit-cl-1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("channel-listing-remove-cl-1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("channels-section-add-button")).not.toBeInTheDocument();
    expect(screen.getByTestId("channels-section")).toHaveTextContent(LISTING_MESSAGES.channelsIntroViewer);
    expect(screen.queryByText(LISTING_MESSAGES.channelsIntro)).not.toBeInTheDocument();
  });

  it("gives a viewer a short empty state with no add button", () => {
    render(<ChannelsSection canWrite={false} listingId="listing-1" />);
    expect(screen.getByTestId("channels-section-empty-state")).toHaveTextContent("No channels yet.");
    expect(screen.queryByTestId("channels-section-add-cta")).not.toBeInTheDocument();
  });

  it("hides the Add button when all channels are linked", () => {
    const both: ChannelListing[] = [
      cl,
      { ...cl, id: "cl-2", channel_id: "vrbo", channel: vrbo },
    ];
    mockChannelListings = both;
    render(<ChannelsSection canWrite listingId="listing-1" />);
    expect(
      screen.queryByTestId("channels-section-add-button"),
    ).not.toBeInTheDocument();
  });

  it("calls delete mutation and shows success toast on remove", async () => {
    mockChannelListings = [cl];
    deleteMutationMock.mockReturnValue({
      unwrap: () => Promise.resolve(undefined),
    });

    render(<ChannelsSection canWrite listingId="listing-1" />);
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

    render(<ChannelsSection canWrite listingId="listing-1" />);
    await userEvent.setup().click(screen.getByTestId("channel-listing-remove-cl-1"));

    await waitFor(() => {
      expect(showErrorMock).toHaveBeenCalled();
    });
  });
});
