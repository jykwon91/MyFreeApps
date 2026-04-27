import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ExternalIdSection from "@/app/features/listings/ExternalIdSection";
import type { ListingExternalId } from "@/shared/types/listing/listing-external-id";

const deleteMutationMock = vi.fn();

const showErrorMock = vi.fn();
const showSuccessMock = vi.fn();

vi.mock("@/shared/lib/toast-store", () => ({
  showError: (msg: string) => showErrorMock(msg),
  showSuccess: (msg: string) => showSuccessMock(msg),
}));

vi.mock("@/shared/store/listingsApi", () => ({
  useCreateListingExternalIdMutation: vi.fn(() => [
    vi.fn(() => ({ unwrap: () => Promise.resolve(undefined) })),
    { isLoading: false },
  ]),
  useUpdateListingExternalIdMutation: vi.fn(() => [
    vi.fn(() => ({ unwrap: () => Promise.resolve(undefined) })),
    { isLoading: false },
  ]),
  useDeleteListingExternalIdMutation: vi.fn(() => [
    deleteMutationMock,
    { isLoading: false },
  ]),
}));

const oneFFExternalId: ListingExternalId = {
  id: "ext-1",
  listing_id: "listing-1",
  source: "FF",
  external_id: "FF-12345",
  external_url: "https://example.com/ff/12345",
  created_at: "2026-01-01T00:00:00Z",
};

describe("ExternalIdSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the empty state with a CTA when no external_ids exist", () => {
    render(<ExternalIdSection listingId="listing-1" externalIds={[]} />);
    expect(screen.getByTestId("external-id-empty-state")).toBeInTheDocument();
    expect(screen.getByTestId("external-id-add-cta")).toBeInTheDocument();
  });

  it("renders one row per external_id", () => {
    render(
      <ExternalIdSection
        listingId="listing-1"
        externalIds={[oneFFExternalId]}
      />,
    );
    expect(screen.getByTestId("external-id-list")).toBeInTheDocument();
    expect(screen.getByTestId("external-id-row-ext-1")).toBeInTheDocument();
    expect(
      screen.queryByTestId("external-id-empty-state"),
    ).not.toBeInTheDocument();
  });

  it('opens the add form when "Add link" is clicked', async () => {
    render(
      <ExternalIdSection
        listingId="listing-1"
        externalIds={[oneFFExternalId]}
      />,
    );
    expect(screen.queryByTestId("external-id-form")).not.toBeInTheDocument();
    await userEvent
      .setup()
      .click(screen.getByTestId("external-id-add-button"));
    expect(screen.getByTestId("external-id-form")).toBeInTheDocument();
  });

  it("hides the Add link button when all sources are already linked", () => {
    const allFour: ListingExternalId[] = [
      { ...oneFFExternalId, id: "ext-FF", source: "FF" },
      { ...oneFFExternalId, id: "ext-TNH", source: "TNH" },
      { ...oneFFExternalId, id: "ext-Airbnb", source: "Airbnb" },
      { ...oneFFExternalId, id: "ext-direct", source: "direct" },
    ];
    render(<ExternalIdSection listingId="listing-1" externalIds={allFour} />);
    expect(
      screen.queryByTestId("external-id-add-button"),
    ).not.toBeInTheDocument();
  });

  it("calls the delete mutation when Remove is clicked and shows success toast", async () => {
    deleteMutationMock.mockReturnValue({
      unwrap: () => Promise.resolve(undefined),
    });
    render(
      <ExternalIdSection
        listingId="listing-1"
        externalIds={[oneFFExternalId]}
      />,
    );
    await userEvent
      .setup()
      .click(screen.getByTestId("external-id-remove-ext-1"));
    await waitFor(() => {
      expect(deleteMutationMock).toHaveBeenCalledWith({
        listingId: "listing-1",
        externalIdPk: "ext-1",
      });
      expect(showSuccessMock).toHaveBeenCalled();
    });
  });

  it("shows an error toast when delete fails", async () => {
    deleteMutationMock.mockReturnValue({
      unwrap: () => Promise.reject(new Error("network")),
    });
    render(
      <ExternalIdSection
        listingId="listing-1"
        externalIds={[oneFFExternalId]}
      />,
    );
    await userEvent
      .setup()
      .click(screen.getByTestId("external-id-remove-ext-1"));
    await waitFor(() => {
      expect(showErrorMock).toHaveBeenCalled();
    });
  });

  it("opens edit form when Edit is clicked on a row", async () => {
    render(
      <ExternalIdSection
        listingId="listing-1"
        externalIds={[oneFFExternalId]}
      />,
    );
    await userEvent.setup().click(screen.getByTestId("external-id-edit-ext-1"));
    expect(screen.getByTestId("external-id-form")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /edit furnished finder/i }),
    ).toBeInTheDocument();
  });
});
