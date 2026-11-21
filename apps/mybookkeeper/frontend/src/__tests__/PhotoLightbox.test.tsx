import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PhotoLightbox from "@/app/features/listings/PhotoLightbox";
import type { ListingPhoto } from "@mybookkeeper/api-client/types/listing/listing-photo";

function makePhoto(
  id: string,
  displayOrder: number,
  presignedUrl: string | null = `https://storage.example.com/photo-${id}.jpg`,
): ListingPhoto {
  return {
    id,
    listing_id: "listing-1",
    storage_key: `listings/listing-1/${id}.jpg`,
    caption: null,
    display_order: displayOrder,
    created_at: "2026-01-01T00:00:00Z",
    presigned_url: presignedUrl,
  };
}

const THREE_PHOTOS: ListingPhoto[] = [
  makePhoto("p1", 0),
  makePhoto("p2", 1),
  makePhoto("p3", 2),
];

describe("PhotoLightbox", () => {
  let onClose: ReturnType<typeof vi.fn<() => void>>;
  let onNavigate: ReturnType<typeof vi.fn<(nextIndex: number) => void>>;

  beforeEach(() => {
    onClose = vi.fn<() => void>();
    onNavigate = vi.fn<(nextIndex: number) => void>();
  });

  it("renders with the correct photo when opened at index 0", () => {
    render(
      <PhotoLightbox
        photos={THREE_PHOTOS}
        currentIndex={0}
        onClose={onClose}
        onNavigate={onNavigate}
      />,
    );

    const img = screen.getByTestId("photo-lightbox-image");
    expect(img).toHaveAttribute("src", "https://storage.example.com/photo-p1.jpg");
    expect(screen.getByTestId("photo-lightbox-counter")).toHaveTextContent("1 / 3");
  });

  it("renders the counter correctly for middle photo", () => {
    render(
      <PhotoLightbox
        photos={THREE_PHOTOS}
        currentIndex={1}
        onClose={onClose}
        onNavigate={onNavigate}
      />,
    );

    expect(screen.getByTestId("photo-lightbox-counter")).toHaveTextContent("2 / 3");
    const img = screen.getByTestId("photo-lightbox-image");
    expect(img).toHaveAttribute("src", "https://storage.example.com/photo-p2.jpg");
  });

  it("calls onClose when the close button is clicked", () => {
    render(
      <PhotoLightbox
        photos={THREE_PHOTOS}
        currentIndex={0}
        onClose={onClose}
        onNavigate={onNavigate}
      />,
    );

    fireEvent.click(screen.getByTestId("photo-lightbox-close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when clicking the backdrop outside the image", () => {
    render(
      <PhotoLightbox
        photos={THREE_PHOTOS}
        currentIndex={0}
        onClose={onClose}
        onNavigate={onNavigate}
      />,
    );

    fireEvent.click(screen.getByTestId("photo-lightbox-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when Escape key is pressed", () => {
    render(
      <PhotoLightbox
        photos={THREE_PHOTOS}
        currentIndex={1}
        onClose={onClose}
        onNavigate={onNavigate}
      />,
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onNavigate with next index when right arrow key is pressed", () => {
    render(
      <PhotoLightbox
        photos={THREE_PHOTOS}
        currentIndex={0}
        onClose={onClose}
        onNavigate={onNavigate}
      />,
    );

    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(onNavigate).toHaveBeenCalledWith(1);
  });

  it("calls onNavigate with prev index when left arrow key is pressed", () => {
    render(
      <PhotoLightbox
        photos={THREE_PHOTOS}
        currentIndex={2}
        onClose={onClose}
        onNavigate={onNavigate}
      />,
    );

    fireEvent.keyDown(document, { key: "ArrowLeft" });
    expect(onNavigate).toHaveBeenCalledWith(1);
  });

  it("does not call onNavigate when pressing left on the first photo", () => {
    render(
      <PhotoLightbox
        photos={THREE_PHOTOS}
        currentIndex={0}
        onClose={onClose}
        onNavigate={onNavigate}
      />,
    );

    fireEvent.keyDown(document, { key: "ArrowLeft" });
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("does not call onNavigate when pressing right on the last photo", () => {
    render(
      <PhotoLightbox
        photos={THREE_PHOTOS}
        currentIndex={2}
        onClose={onClose}
        onNavigate={onNavigate}
      />,
    );

    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("calls onNavigate when the next arrow button is clicked", () => {
    render(
      <PhotoLightbox
        photos={THREE_PHOTOS}
        currentIndex={0}
        onClose={onClose}
        onNavigate={onNavigate}
      />,
    );

    fireEvent.click(screen.getByTestId("photo-lightbox-next"));
    expect(onNavigate).toHaveBeenCalledWith(1);
  });

  it("calls onNavigate when the prev arrow button is clicked", () => {
    render(
      <PhotoLightbox
        photos={THREE_PHOTOS}
        currentIndex={1}
        onClose={onClose}
        onNavigate={onNavigate}
      />,
    );

    fireEvent.click(screen.getByTestId("photo-lightbox-prev"));
    expect(onNavigate).toHaveBeenCalledWith(0);
  });

  it("hides the prev button on the first photo", () => {
    render(
      <PhotoLightbox
        photos={THREE_PHOTOS}
        currentIndex={0}
        onClose={onClose}
        onNavigate={onNavigate}
      />,
    );

    expect(screen.queryByTestId("photo-lightbox-prev")).not.toBeInTheDocument();
    expect(screen.getByTestId("photo-lightbox-next")).toBeInTheDocument();
  });

  it("hides the next button on the last photo", () => {
    render(
      <PhotoLightbox
        photos={THREE_PHOTOS}
        currentIndex={2}
        onClose={onClose}
        onNavigate={onNavigate}
      />,
    );

    expect(screen.queryByTestId("photo-lightbox-next")).not.toBeInTheDocument();
    expect(screen.getByTestId("photo-lightbox-prev")).toBeInTheDocument();
  });

  it("shows the unavailable state when presigned_url is null", () => {
    const photos = [makePhoto("p1", 0, null)];
    render(
      <PhotoLightbox
        photos={photos}
        currentIndex={0}
        onClose={onClose}
        onNavigate={onNavigate}
      />,
    );

    expect(screen.getByTestId("photo-lightbox-unavailable")).toBeInTheDocument();
    expect(screen.queryByTestId("photo-lightbox-image")).not.toBeInTheDocument();
  });

  it("renders only one arrow when there are exactly 2 photos", () => {
    const twoPhotos = [makePhoto("a", 0), makePhoto("b", 1)];
    render(
      <PhotoLightbox
        photos={twoPhotos}
        currentIndex={0}
        onClose={onClose}
        onNavigate={onNavigate}
      />,
    );

    expect(screen.queryByTestId("photo-lightbox-prev")).not.toBeInTheDocument();
    expect(screen.getByTestId("photo-lightbox-next")).toBeInTheDocument();
  });

  it("shows no arrows for a single photo", () => {
    const singlePhoto = [makePhoto("only", 0)];
    render(
      <PhotoLightbox
        photos={singlePhoto}
        currentIndex={0}
        onClose={onClose}
        onNavigate={onNavigate}
      />,
    );

    expect(screen.queryByTestId("photo-lightbox-prev")).not.toBeInTheDocument();
    expect(screen.queryByTestId("photo-lightbox-next")).not.toBeInTheDocument();
    expect(screen.getByTestId("photo-lightbox-counter")).toHaveTextContent("1 / 1");
  });

  it("is a dialog named Photo viewer that takes focus and keeps Tab inside", async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">Behind</button>
        <PhotoLightbox photos={THREE_PHOTOS} currentIndex={1} onClose={onClose} onNavigate={onNavigate} />
      </>,
    );

    const dialog = screen.getByRole("dialog", { name: "Photo viewer" });
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    for (let i = 0; i < 5; i += 1) {
      await user.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
    expect(screen.queryByRole("button", { name: "Behind" })).not.toBeInTheDocument();
  });

  it("closes once on Escape from inside the dialog", async () => {
    const user = userEvent.setup();
    render(
      <PhotoLightbox photos={THREE_PHOTOS} currentIndex={0} onClose={onClose} onNavigate={onNavigate} />,
    );

    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close on a click on the image", async () => {
    const user = userEvent.setup();
    render(
      <PhotoLightbox photos={THREE_PHOTOS} currentIndex={0} onClose={onClose} onNavigate={onNavigate} />,
    );

    await user.click(screen.getByTestId("photo-lightbox-image"));

    expect(onClose).not.toHaveBeenCalled();
  });
});
