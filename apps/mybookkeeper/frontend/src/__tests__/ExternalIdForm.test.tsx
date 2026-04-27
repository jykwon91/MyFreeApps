import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ExternalIdForm from "@/app/features/listings/ExternalIdForm";
import type { ListingExternalId } from "@/shared/types/listing/listing-external-id";

const createMutationMock = vi.fn();
const updateMutationMock = vi.fn();

const showErrorMock = vi.fn();
const showSuccessMock = vi.fn();

vi.mock("@/shared/lib/toast-store", () => ({
  showError: (msg: string) => showErrorMock(msg),
  showSuccess: (msg: string) => showSuccessMock(msg),
}));

vi.mock("@/shared/store/listingsApi", () => ({
  useCreateListingExternalIdMutation: vi.fn(() => [
    createMutationMock,
    { isLoading: false },
  ]),
  useUpdateListingExternalIdMutation: vi.fn(() => [
    updateMutationMock,
    { isLoading: false },
  ]),
}));

describe("ExternalIdForm — create mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("hides already-linked sources from the dropdown", () => {
    render(
      <ExternalIdForm
        listingId="listing-1"
        linkedSources={["FF", "TNH"]}
        onSuccess={() => {}}
        onCancel={() => {}}
      />,
    );
    const select = screen.getByTestId("external-id-form-source") as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.value);
    expect(options).not.toContain("FF");
    expect(options).not.toContain("TNH");
    expect(options).toContain("Airbnb");
    expect(options).toContain("direct");
  });

  it("requires at least one of external_id or external_url", async () => {
    const onSuccess = vi.fn();
    render(
      <ExternalIdForm
        listingId="listing-1"
        linkedSources={[]}
        onSuccess={onSuccess}
        onCancel={() => {}}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId("external-id-form-submit"));
    expect(
      screen.getByTestId("external-id-form-validation-error"),
    ).toBeInTheDocument();
    expect(createMutationMock).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("submits the create mutation on valid input", async () => {
    createMutationMock.mockReturnValue({
      unwrap: () => Promise.resolve(undefined),
    });
    const onSuccess = vi.fn();
    render(
      <ExternalIdForm
        listingId="listing-1"
        linkedSources={[]}
        onSuccess={onSuccess}
        onCancel={() => {}}
      />,
    );
    const user = userEvent.setup();
    await user.type(
      screen.getByTestId("external-id-form-external-id"),
      "FF-12345",
    );
    await user.click(screen.getByTestId("external-id-form-submit"));
    await waitFor(() => {
      expect(createMutationMock).toHaveBeenCalledWith({
        listingId: "listing-1",
        data: {
          source: "FF",
          external_id: "FF-12345",
          external_url: null,
        },
      });
      expect(onSuccess).toHaveBeenCalled();
      expect(showSuccessMock).toHaveBeenCalled();
    });
  });

  it("surfaces 409 conflict from the server as a toast", async () => {
    createMutationMock.mockReturnValue({
      unwrap: () =>
        Promise.reject({
          status: 409,
          data: { detail: "This FF ID is already linked to another listing." },
        }),
    });
    const onSuccess = vi.fn();
    render(
      <ExternalIdForm
        listingId="listing-1"
        linkedSources={[]}
        onSuccess={onSuccess}
        onCancel={() => {}}
      />,
    );
    const user = userEvent.setup();
    await user.type(
      screen.getByTestId("external-id-form-external-id"),
      "FF-1",
    );
    await user.click(screen.getByTestId("external-id-form-submit"));
    await waitFor(() => {
      expect(showErrorMock).toHaveBeenCalledWith(
        "This FF ID is already linked to another listing.",
      );
      expect(onSuccess).not.toHaveBeenCalled();
    });
  });

  it("calls onCancel when Cancel is clicked", async () => {
    const onCancel = vi.fn();
    render(
      <ExternalIdForm
        listingId="listing-1"
        linkedSources={[]}
        onSuccess={() => {}}
        onCancel={onCancel}
      />,
    );
    await userEvent.setup().click(screen.getByTestId("external-id-form-cancel"));
    expect(onCancel).toHaveBeenCalled();
  });

  it("disables submit when all sources are linked", () => {
    render(
      <ExternalIdForm
        listingId="listing-1"
        linkedSources={["FF", "TNH", "Airbnb", "direct"]}
        onSuccess={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByTestId("external-id-form-submit")).toBeDisabled();
  });
});

describe("ExternalIdForm — edit mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const existing: ListingExternalId = {
    id: "ext-1",
    listing_id: "listing-1",
    source: "FF",
    external_id: "FF-1",
    external_url: "https://example.com/ff/1",
    created_at: "2026-01-01T00:00:00Z",
  };

  it("disables the source dropdown", () => {
    render(
      <ExternalIdForm
        listingId="listing-1"
        existing={existing}
        linkedSources={["FF"]}
        onSuccess={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByTestId("external-id-form-source")).toBeDisabled();
  });

  it("submits the update mutation with the existing row's PK", async () => {
    updateMutationMock.mockReturnValue({
      unwrap: () => Promise.resolve(undefined),
    });
    const onSuccess = vi.fn();
    render(
      <ExternalIdForm
        listingId="listing-1"
        existing={existing}
        linkedSources={["FF"]}
        onSuccess={onSuccess}
        onCancel={() => {}}
      />,
    );
    const user = userEvent.setup();
    const urlInput = screen.getByTestId(
      "external-id-form-external-url",
    ) as HTMLInputElement;
    await user.clear(urlInput);
    await user.type(urlInput, "https://new.example.com/x");
    await user.click(screen.getByTestId("external-id-form-submit"));
    await waitFor(() => {
      expect(updateMutationMock).toHaveBeenCalledWith({
        listingId: "listing-1",
        externalIdPk: "ext-1",
        data: {
          external_id: "FF-1",
          external_url: "https://new.example.com/x",
        },
      });
      expect(onSuccess).toHaveBeenCalled();
    });
  });
});
