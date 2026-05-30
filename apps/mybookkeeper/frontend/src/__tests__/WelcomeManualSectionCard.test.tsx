/**
 * Unit tests for a welcome-manual section card.
 *
 * Verifies:
 *   - Save is disabled when the section is clean (no edits).
 *   - Editing the body enables Save; saving sends a dirty-only PATCH (only the
 *     changed field).
 *   - A freshly-seeded stub (body: null) shows the placeholder prompt, not a
 *     blank pre-filled field.
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

// Image manager hits these but we only assert section editing here.
vi.mock("@/shared/store/welcomeManualsApi", () => ({
  useUpdateSectionMutation: vi.fn(() => [updateSectionMock, { isLoading: false }]),
  useDeleteSectionMutation: vi.fn(() => [deleteSectionMock, { isLoading: false }]),
  useUploadSectionImagesMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useUpdateSectionImageMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useDeleteSectionImageMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
}));

function makeSection(overrides: Partial<WelcomeManualSectionResponse>): WelcomeManualSectionResponse {
  return {
    id: "sec-1",
    manual_id: "m-1",
    title: "Wi-Fi",
    body: "Network: Lakeview, password hunter2",
    display_order: 0,
    images: [],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function renderCard(section: WelcomeManualSectionResponse) {
  return render(
    <DndContext>
      <WelcomeManualSectionCard manualId="m-1" section={section} />
    </DndContext>,
  );
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
});
