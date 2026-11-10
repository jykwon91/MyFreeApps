/**
 * Unit tests for the section image manager's photo cap:
 *   - "Add photos" is disabled once the section holds the max photos.
 *   - A batch that would pass the cap is blocked client-side (no upload).
 *   - A batch that fits still uploads.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { showError } from "@platform/ui";
import WelcomeManualSectionImageManager from "@/app/features/welcome-manuals/WelcomeManualSectionImageManager";
import { WELCOME_MANUAL_MAX_SECTION_IMAGES, WELCOME_MANUAL_STALE_ORDER_MESSAGE } from "@mybookkeeper/api-client/constants/welcomeManualLimits";
import type { WelcomeManualSectionImageResponse } from "@mybookkeeper/api-client/types/welcome-manual/welcome-manual-section-image-response";

const uploadMock = vi.fn();
const reorderMock = vi.fn();
let capturedDragEnd: ((e: unknown) => Promise<void>) | undefined;
vi.mock("@dnd-kit/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@dnd-kit/core")>()),
  DndContext: ({ children, onDragEnd }: { children: React.ReactNode; onDragEnd: (e: unknown) => Promise<void> }) => {
    capturedDragEnd = onDragEnd;
    return <>{children}</>;
  },
}));


vi.mock("@platform/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@platform/ui")>()),
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

vi.mock("@mybookkeeper/api-client/store/welcomeManualsApi", () => ({
  useUploadSectionImagesMutation: vi.fn(() => [uploadMock, { isLoading: false }]),
  useDeleteSectionImageMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useUpdateSectionImageMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useReorderSectionImagesMutation: vi.fn(() => [reorderMock, { isLoading: false }]),
}));

function makeImages(count: number): WelcomeManualSectionImageResponse[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `img-${i}`,
    section_id: "sec-1",
    storage_key: `k-${i}`,
    caption: null,
    display_order: i,
    created_at: "2026-01-01T00:00:00Z",
  }));
}

function jpeg(name: string): File {
  return new File(["x"], name, { type: "image/jpeg" });
}

function renderManager(count: number) {
  return render(
    <WelcomeManualSectionImageManager manualId="m-1" sectionId="sec-1" images={makeImages(count)} />,
  );
}

describe("WelcomeManualSectionImageManager photo cap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("disables Add photos at the cap", () => {
    renderManager(WELCOME_MANUAL_MAX_SECTION_IMAGES);
    expect(screen.getByTestId("welcome-manual-image-upload-button")).toBeDisabled();
  });

  it("keeps Add photos enabled below the cap", () => {
    renderManager(WELCOME_MANUAL_MAX_SECTION_IMAGES - 1);
    expect(screen.getByTestId("welcome-manual-image-upload-button")).not.toBeDisabled();
  });

  it("blocks a batch that would pass the cap without uploading", () => {
    renderManager(WELCOME_MANUAL_MAX_SECTION_IMAGES - 1);
    const input = screen.getByTestId("welcome-manual-image-file-input");
    fireEvent.change(input, { target: { files: [jpeg("a.jpg"), jpeg("b.jpg")] } });

    expect(uploadMock).not.toHaveBeenCalled();
    expect(showError).toHaveBeenCalledWith(expect.stringContaining(String(WELCOME_MANUAL_MAX_SECTION_IMAGES)));
  });

  it("uploads a batch that fits under the cap", async () => {
    uploadMock.mockReturnValue({ unwrap: () => Promise.resolve([]) });
    renderManager(WELCOME_MANUAL_MAX_SECTION_IMAGES - 2);
    const input = screen.getByTestId("welcome-manual-image-file-input");
    fireEvent.change(input, { target: { files: [jpeg("a.jpg"), jpeg("b.jpg")] } });

    await waitFor(() => expect(uploadMock).toHaveBeenCalledTimes(1));
  });

  it("shows the stale-order copy when a reorder is rejected with 409", async () => {
    reorderMock.mockReturnValue({ unwrap: () => Promise.reject({ status: 409 }) });
    renderManager(2);

    await act(async () => {
      await capturedDragEnd?.({ active: { id: "img-0" }, over: { id: "img-1" } });
    });

    expect(showError).toHaveBeenCalledWith(WELCOME_MANUAL_STALE_ORDER_MESSAGE);
  });
});
