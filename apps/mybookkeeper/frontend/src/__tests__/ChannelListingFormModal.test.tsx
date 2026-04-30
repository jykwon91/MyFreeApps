import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ChannelListingFormModal from "@/app/features/listings/ChannelListingFormModal";
import type { Channel } from "@/shared/types/listing/channel";

const createMutationMock = vi.fn();
const updateMutationMock = vi.fn();
const showSuccessMock = vi.fn();
const showErrorMock = vi.fn();

vi.mock("@/shared/lib/toast-store", () => ({
  showError: (msg: string) => showErrorMock(msg),
  showSuccess: (msg: string) => showSuccessMock(msg),
}));

vi.mock("@/shared/store/listingsApi", () => ({
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

describe("ChannelListingFormModal (create mode)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the channel dropdown with available channels", () => {
    render(
      <ChannelListingFormModal
        open
        listingId="listing-1"
        availableChannels={[airbnb, vrbo]}
        onClose={vi.fn()}
      />,
    );
    const select = screen.getByTestId("channel-listing-form-channel") as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.value);
    expect(options).toEqual(["airbnb", "vrbo"]);
  });

  it("shows validation error when external URL is empty", async () => {
    render(
      <ChannelListingFormModal
        open
        listingId="listing-1"
        availableChannels={[airbnb]}
        onClose={vi.fn()}
      />,
    );
    await userEvent.setup().click(screen.getByTestId("channel-listing-form-submit"));
    expect(
      screen.getByTestId("channel-listing-form-validation-error"),
    ).toBeInTheDocument();
  });

  it("calls create mutation with the entered fields and closes on success", async () => {
    createMutationMock.mockReturnValue({
      unwrap: () => Promise.resolve(undefined),
    });
    const onClose = vi.fn();
    render(
      <ChannelListingFormModal
        open
        listingId="listing-1"
        availableChannels={[airbnb]}
        onClose={onClose}
      />,
    );

    await userEvent.setup().type(
      screen.getByTestId("channel-listing-form-external-url"),
      "https://airbnb.com/rooms/12345",
    );
    await userEvent.setup().type(
      screen.getByTestId("channel-listing-form-external-id"),
      "12345",
    );
    await userEvent.setup().click(screen.getByTestId("channel-listing-form-submit"));

    await waitFor(() => {
      expect(createMutationMock).toHaveBeenCalledWith({
        listingId: "listing-1",
        data: expect.objectContaining({
          channel_id: "airbnb",
          external_url: "https://airbnb.com/rooms/12345",
          external_id: "12345",
          ical_import_url: null,
        }),
      });
      expect(showSuccessMock).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("disables submit when no channels are available", () => {
    render(
      <ChannelListingFormModal
        open
        listingId="listing-1"
        availableChannels={[]}
        onClose={vi.fn()}
      />,
    );
    const submit = screen.getByTestId("channel-listing-form-submit") as HTMLButtonElement;
    expect(submit).toBeDisabled();
  });

  it("shows error toast when create fails", async () => {
    createMutationMock.mockReturnValue({
      unwrap: () => Promise.reject({ data: { detail: "Already linked" } }),
    });
    render(
      <ChannelListingFormModal
        open
        listingId="listing-1"
        availableChannels={[airbnb]}
        onClose={vi.fn()}
      />,
    );
    await userEvent.setup().type(
      screen.getByTestId("channel-listing-form-external-url"),
      "https://airbnb.com/x",
    );
    await userEvent.setup().click(screen.getByTestId("channel-listing-form-submit"));
    await waitFor(() => {
      expect(showErrorMock).toHaveBeenCalledWith("Already linked");
    });
  });
});
