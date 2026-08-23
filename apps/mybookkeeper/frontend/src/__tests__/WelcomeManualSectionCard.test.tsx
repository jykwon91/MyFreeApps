/**
 * Unit tests for a welcome-manual section card.
 *
 * Verifies:
 *   - Save is disabled when the section is clean (no edits).
 *   - Editing the body enables Save; saving sends a dirty-only PATCH (only the
 *     changed field).
 *   - A freshly-seeded stub (body: null) shows the placeholder prompt, not a
 *     blank pre-filled field.
 *   - Unsaved text survives a refetch that leaves the persisted title/body
 *     untouched (e.g. uploading a photo into the section mid-edit).
 *   - A genuine server-side change to the persisted body still re-baselines.
 *   - A section still carrying the placeholder title is flagged as just-added.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DndContext } from "@dnd-kit/core";
import WelcomeManualSectionCard from "@/app/features/welcome-manuals/WelcomeManualSectionCard";
import type { WelcomeManualSectionResponse } from "@/shared/types/welcome-manual/welcome-manual-section-response";

const updateSectionMock = vi.fn();
const deleteSectionMock = vi.fn();

vi.mock("@/shared/lib/toast-store", () => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

// Image + field managers hit these but we only assert section editing here.
vi.mock("@/shared/store/welcomeManualsApi", () => ({
  useUpdateSectionMutation: vi.fn(() => [updateSectionMock, { isLoading: false }]),
  useDeleteSectionMutation: vi.fn(() => [deleteSectionMock, { isLoading: false }]),
  useUploadSectionImagesMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useUpdateSectionImageMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useDeleteSectionImageMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useCreateSectionFieldMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useUpdateSectionFieldMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useDeleteSectionFieldMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
}));

function makeSection(overrides: Partial<WelcomeManualSectionResponse>): WelcomeManualSectionResponse {
  return {
    id: "sec-1",
    manual_id: "m-1",
    title: "Wi-Fi",
    body: "Network: Lakeview, password hunter2",
    display_order: 0,
    fields: [],
    images: [],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function renderCard(section: WelcomeManualSectionResponse) {
  const utils = render(
    <DndContext>
      <WelcomeManualSectionCard manualId="m-1" section={section} />
    </DndContext>,
  );
  return {
    ...utils,
    /** Simulate the manual refetching and handing this card a new section object. */
    refetchWith: (next: WelcomeManualSectionResponse) =>
      utils.rerender(
        <DndContext>
          <WelcomeManualSectionCard manualId="m-1" section={next} />
        </DndContext>,
      ),
  };
}

describe("WelcomeManualSectionCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("disables Save when the section is clean", () => {
    renderCard(makeSection({}));
    expect(screen.getByTestId("welcome-manual-section-save")).toBeDisabled();
  });

  it("enables Save after editing the body and sends a dirty-only PATCH", async () => {
    updateSectionMock.mockReturnValue({ unwrap: () => Promise.resolve(makeSection({})) });
    renderCard(makeSection({}));

    const body = screen.getByTestId("welcome-manual-section-body");
    await userEvent.clear(body);
    await userEvent.type(body, "New Wi-Fi instructions");

    const save = screen.getByTestId("welcome-manual-section-save");
    expect(save).not.toBeDisabled();
    await userEvent.click(save);

    await waitFor(() => {
      expect(updateSectionMock).toHaveBeenCalledWith({
        manualId: "m-1",
        sectionId: "sec-1",
        data: { body: "New Wi-Fi instructions" },
      });
    });
  });

  it("shows the placeholder prompt for a freshly-seeded stub (body: null)", () => {
    renderCard(makeSection({ body: null }));
    const body = screen.getByTestId("welcome-manual-section-body") as HTMLTextAreaElement;
    expect(body.value).toBe("");
    expect(body.placeholder).toBe("Add instructions for guests…");
    // No preview rendered when the body is empty.
    expect(screen.queryByTestId("welcome-manual-section-body-preview")).not.toBeInTheDocument();
  });

  it("keeps unsaved text when a photo upload refetches the manual", async () => {
    // Uploading an image invalidates the whole manual tag, so this card is
    // handed a brand-new section object whose title/body are unchanged. That
    // must not discard what the host has typed but not yet saved.
    const { refetchWith } = renderCard(makeSection({ body: null }));

    const body = screen.getByTestId("welcome-manual-section-body") as HTMLTextAreaElement;
    await userEvent.type(body, "Router is in the hall closet");

    refetchWith(
      makeSection({
        body: null,
        images: [
          {
            id: "img-1",
            section_id: "sec-1",
            storage_key: "welcome-manuals/m-1/sec-1/img-1.jpg",
            caption: null,
            display_order: 0,
            presigned_url: "https://example.test/img-1.jpg",
            is_available: true,
            created_at: "2026-01-01T00:00:00Z",
          },
        ],
      }),
    );

    expect(
      (screen.getByTestId("welcome-manual-section-body") as HTMLTextAreaElement).value,
    ).toBe("Router is in the hall closet");
    expect(screen.getByTestId("welcome-manual-section-save")).not.toBeDisabled();
  });

  it("re-baselines when the persisted body actually changes", () => {
    const { refetchWith } = renderCard(makeSection({ body: "Old text" }));
    refetchWith(makeSection({ body: "Saved from another tab" }));

    const body = screen.getByTestId("welcome-manual-section-body") as HTMLTextAreaElement;
    expect(body.value).toBe("Saved from another tab");
    expect(screen.getByTestId("welcome-manual-section-save")).toBeDisabled();
  });

  it("flags a section that still carries the placeholder title", () => {
    renderCard(makeSection({ title: "New section", body: null }));
    expect(screen.getByTestId("welcome-manual-section-unnamed-badge")).toBeInTheDocument();
  });

  it("drops the just-added flag once the section has a real title", () => {
    renderCard(makeSection({ title: "Wi-Fi" }));
    expect(
      screen.queryByTestId("welcome-manual-section-unnamed-badge"),
    ).not.toBeInTheDocument();
  });

  it("renders the field manager with an Add-field button", () => {
    renderCard(makeSection({}));
    expect(screen.getByTestId("welcome-manual-field-manager")).toBeInTheDocument();
    expect(screen.getByTestId("welcome-manual-field-add-button")).toBeInTheDocument();
    // No fields seeded → empty state shows.
    expect(screen.getByTestId("welcome-manual-field-empty-state")).toBeInTheDocument();
  });
});
