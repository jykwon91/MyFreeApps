import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { store } from "@/shared/store";
import ListingPhotoManager from "@/app/features/listings/ListingPhotoManager";
import type { ListingPhoto } from "@/shared/types/listing/listing-photo";

const uploadMock = vi.fn(() => ({ unwrap: () => Promise.resolve([]) }));
const deleteMock = vi.fn(() => ({ unwrap: () => Promise.resolve(undefined) }));
const updateMock = vi.fn(() => ({ unwrap: () => Promise.resolve(undefined) }));

vi.mock("@/shared/store/listingsApi", () => ({
  useUploadListingPhotosMutation: vi.fn(() => [uploadMock, { isLoading: false }]),
  useDeleteListingPhotoMutation: vi.fn(() => [deleteMock, { isLoading: false }]),
  useUpdateListingPhotoMutation: vi.fn(() => [updateMock, { isLoading: false }]),
}));

function renderManager(photos: ListingPhoto[] = []) {
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <ListingPhotoManager listingId="listing-1" photos={photos} />
      </MemoryRouter>
    </Provider>,
  );
}

describe("ListingPhotoManager", () => {
  beforeEach(() => {
    uploadMock.mockClear();
    deleteMock.mockClear();
    updateMock.mockClear();
  });

  it("renders the empty state when no photos exist", () => {
    renderManager();
    expect(screen.getByTestId("listing-photo-empty-state")).toBeInTheDocument();
  });

  it("renders one card per photo", () => {
    renderManager([
      {
        id: "p1", listing_id: "listing-1", storage_key: "k1",
        caption: null, display_order: 0, created_at: "2026-01-01T00:00:00Z", presigned_url: null,
      },
      {
        id: "p2", listing_id: "listing-1", storage_key: "k2",
        caption: "front", display_order: 1, created_at: "2026-01-01T00:00:00Z",
        presigned_url: null,
      },
    ]);
    expect(screen.getAllByTestId("listing-photo-card")).toHaveLength(2);
  });

  it("triggers upload mutation when a valid file is selected", async () => {
    renderManager();
    const fileInput = screen.getByTestId("listing-photo-file-input") as HTMLInputElement;
    const file = new File(["jpeg-bytes"], "test.jpg", { type: "image/jpeg" });
    const user = userEvent.setup();
    await user.upload(fileInput, file);

    expect(uploadMock).toHaveBeenCalledTimes(1);
    const arg = (uploadMock.mock.calls[0] as unknown as [{ listingId: string; files: File[] }])[0];
    expect(arg.listingId).toBe("listing-1");
    expect(arg.files).toHaveLength(1);
    expect(arg.files[0].name).toBe("test.jpg");
  });

  it("rejects oversized files client-side and does not call upload", async () => {
    renderManager();
    const fileInput = screen.getByTestId("listing-photo-file-input") as HTMLInputElement;
    // Build a file that exceeds 10MB without actually allocating that much
    const big = new File([new ArrayBuffer(11 * 1024 * 1024)], "big.jpg", {
      type: "image/jpeg",
    });
    const user = userEvent.setup();
    await user.upload(fileInput, big);

    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("rejects unsupported file types client-side", async () => {
    renderManager();
    const fileInput = screen.getByTestId("listing-photo-file-input") as HTMLInputElement;
    const pdf = new File(["fake"], "doc.pdf", { type: "application/pdf" });
    const user = userEvent.setup();
    await user.upload(fileInput, pdf);

    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("opens a confirmation dialog when delete is clicked, calls mutation on confirm", async () => {
    renderManager([
      {
        id: "p1", listing_id: "listing-1", storage_key: "k1",
        caption: null, display_order: 0, created_at: "2026-01-01T00:00:00Z", presigned_url: null,
      },
    ]);
    const user = userEvent.setup();
    await user.click(screen.getByTestId("listing-photo-delete-button"));
    expect(screen.getByText(/Remove this photo\?/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /remove/i }));

    expect(deleteMock).toHaveBeenCalledWith({ listingId: "listing-1", photoId: "p1" });
  });

  it("renders photos in display_order regardless of input order", () => {
    renderManager([
      {
        id: "p2", listing_id: "listing-1", storage_key: "k2",
        caption: null, display_order: 1, created_at: "2026-01-01T00:00:00Z",
        presigned_url: null,
      },
      {
        id: "p1", listing_id: "listing-1", storage_key: "k1",
        caption: null, display_order: 0, created_at: "2026-01-01T00:00:00Z", presigned_url: null,
      },
    ]);
    const cards = screen.getAllByTestId("listing-photo-card");
    expect(cards[0]).toHaveAttribute("data-photo-id", "p1");
    expect(cards[1]).toHaveAttribute("data-photo-id", "p2");
  });
});
