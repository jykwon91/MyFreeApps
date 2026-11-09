import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { store } from "@/shared/store";
import ListingPhotoManager from "@/app/features/listings/ListingPhotoManager";
import type { ListingPhoto } from "@mybookkeeper/api-client/types/listing/listing-photo";

const uploadMock = vi.fn(() => ({ unwrap: () => Promise.resolve([]) }));
const deleteMock = vi.fn(() => ({ unwrap: () => Promise.resolve(undefined) }));
const reorderMock = vi.fn(() => ({ unwrap: () => Promise.resolve([]) }));
const invalidateTagsMock = vi.fn((tags: unknown) => ({ type: "invalidate", tags }));

vi.mock("@mybookkeeper/api-client/store/listingsApi", () => ({
  listingsApi: { util: { invalidateTags: (tags: unknown) => invalidateTagsMock(tags) } },
  useUploadListingPhotosMutation: vi.fn(() => [uploadMock, { isLoading: false }]),
  useDeleteListingPhotoMutation: vi.fn(() => [deleteMock, { isLoading: false }]),
  useReorderListingPhotosMutation: vi.fn(() => [reorderMock, { isLoading: false }]),
}));

function renderManager(photos: ListingPhoto[] = [], canWrite = true) {
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <ListingPhotoManager canWrite={canWrite} listingId="listing-1" photos={photos} />
      </MemoryRouter>
    </Provider>,
  );
}

describe("ListingPhotoManager", () => {
  beforeEach(() => {
    uploadMock.mockClear();
    deleteMock.mockClear();
    reorderMock.mockClear();
    invalidateTagsMock.mockClear();
  });

  it("renders the empty state when no photos exist", () => {
    renderManager();
    expect(screen.getByTestId("listing-photo-empty-state")).toBeInTheDocument();
  });

  it("lets a viewer open, select and download photos but not change them", async () => {
    renderManager(
      [{
        id: "p1", listing_id: "listing-1", storage_key: "k1",
        caption: null, display_order: 0, created_at: "2026-01-01T00:00:00Z", presigned_url: null,
      }],
      false,
    );
    expect(screen.queryByTestId("listing-photo-upload-button")).not.toBeInTheDocument();
    expect(screen.queryByTestId("listing-photo-file-input")).not.toBeInTheDocument();
    expect(screen.queryByTestId("listing-photo-drag-handle")).not.toBeInTheDocument();
    expect(screen.queryByTestId("listing-photo-delete-button")).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByTestId("listing-photo-checkbox"));
    expect(screen.getByTestId("photo-bulk-download-button")).toBeInTheDocument();
    expect(screen.queryByTestId("photo-bulk-delete-button")).not.toBeInTheDocument();
  });

  it("tells a viewer there are no photos, with no upload pitch", () => {
    renderManager([], false);
    expect(screen.getByTestId("listing-photo-empty-state")).toHaveTextContent(/^No photos yet\.$/);
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
    const arg = (uploadMock.mock.calls[0] as unknown as [{ listingId: string; form: FormData }])[0];
    const files = arg.form.getAll("files") as File[];
    expect(arg.listingId).toBe("listing-1");
    expect(files).toHaveLength(1);
    expect(files[0].name).toBe("test.jpg");
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

  it("toolbar is hidden when nothing is selected", () => {
    renderManager([
      {
        id: "p1", listing_id: "listing-1", storage_key: "k1",
        caption: null, display_order: 0, created_at: "2026-01-01T00:00:00Z", presigned_url: null,
      },
    ]);
    expect(screen.queryByTestId("photo-selection-toolbar")).not.toBeInTheDocument();
  });

  it("clicking a checkbox shows the toolbar with the correct count", async () => {
    renderManager([
      {
        id: "p1", listing_id: "listing-1", storage_key: "k1",
        caption: null, display_order: 0, created_at: "2026-01-01T00:00:00Z", presigned_url: null,
      },
      {
        id: "p2", listing_id: "listing-1", storage_key: "k2",
        caption: null, display_order: 1, created_at: "2026-01-01T00:00:00Z", presigned_url: null,
      },
    ]);
    const user = userEvent.setup();
    const checkboxes = screen.getAllByTestId("listing-photo-checkbox");
    await user.click(checkboxes[0]);

    expect(screen.getByTestId("photo-selection-toolbar")).toBeInTheDocument();
    expect(screen.getByTestId("photo-selection-count")).toHaveTextContent("1 selected");
  });

  it("bulk delete opens a confirmation dialog and calls delete for each selected photo", async () => {
    renderManager([
      {
        id: "p1", listing_id: "listing-1", storage_key: "k1",
        caption: null, display_order: 0, created_at: "2026-01-01T00:00:00Z", presigned_url: null,
      },
      {
        id: "p2", listing_id: "listing-1", storage_key: "k2",
        caption: null, display_order: 1, created_at: "2026-01-01T00:00:00Z", presigned_url: null,
      },
    ]);
    const user = userEvent.setup();
    const checkboxes = screen.getAllByTestId("listing-photo-checkbox");
    await user.click(checkboxes[0]);
    await user.click(checkboxes[1]);

    await user.click(screen.getByTestId("photo-bulk-delete-button"));
    // Confirmation dialog appears
    expect(screen.getByText(/Delete 2 photos\?/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Delete 2 photos/i }));

    expect(deleteMock).toHaveBeenCalledTimes(2);
    expect(deleteMock).toHaveBeenCalledWith({ listingId: "listing-1", photoId: "p1", refresh: false });
    expect(deleteMock).toHaveBeenCalledWith({ listingId: "listing-1", photoId: "p2", refresh: false });
    // The listing is refreshed once for the batch, not once per photo.
    expect(invalidateTagsMock).toHaveBeenCalledTimes(1);
    expect(invalidateTagsMock).toHaveBeenCalledWith([{ type: "Listing", id: "listing-1" }]);
  });

  it("Clear button hides the toolbar", async () => {
    renderManager([
      {
        id: "p1", listing_id: "listing-1", storage_key: "k1",
        caption: null, display_order: 0, created_at: "2026-01-01T00:00:00Z", presigned_url: null,
      },
    ]);
    const user = userEvent.setup();
    await user.click(screen.getByTestId("listing-photo-checkbox"));
    expect(screen.getByTestId("photo-selection-toolbar")).toBeInTheDocument();

    await user.click(screen.getByTestId("photo-clear-selection-button"));
    expect(screen.queryByTestId("photo-selection-toolbar")).not.toBeInTheDocument();
  });
});
