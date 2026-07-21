/**
 * Unit tests for the welcome-manual section field manager.
 *
 * Verifies:
 *   - The empty state renders when a section has no fields.
 *   - Clicking "Add field" creates a field seeded with the default label.
 *   - An existing field row renders its label + value.
 *   - Editing a value and blurring saves a dirty-only PATCH (changed field only).
 *   - The "Add field" button is disabled once the section hits the field cap.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WelcomeManualSectionFieldManager from "@/app/features/welcome-manuals/WelcomeManualSectionFieldManager";
import {
  MAX_FIELDS_PER_SECTION,
  NEW_FIELD_DEFAULT_LABEL,
} from "@/shared/lib/welcome-manual-constants";
import type { WelcomeManualSectionFieldResponse } from "@/shared/types/welcome-manual/welcome-manual-section-field-response";

const createFieldMock = vi.fn();
const updateFieldMock = vi.fn();
const deleteFieldMock = vi.fn();

vi.mock("@/shared/lib/toast-store", () => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

vi.mock("@/shared/store/welcomeManualsApi", () => ({
  useCreateSectionFieldMutation: vi.fn(() => [createFieldMock, { isLoading: false }]),
  useUpdateSectionFieldMutation: vi.fn(() => [updateFieldMock, { isLoading: false }]),
  useDeleteSectionFieldMutation: vi.fn(() => [deleteFieldMock, { isLoading: false }]),
}));

function makeField(
  overrides: Partial<WelcomeManualSectionFieldResponse> = {},
): WelcomeManualSectionFieldResponse {
  return {
    id: "fld-1",
    section_id: "sec-1",
    label: "Wi-Fi network",
    value: "Lakeview",
    display_order: 0,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function renderManager(fields: WelcomeManualSectionFieldResponse[]) {
  return render(
    <WelcomeManualSectionFieldManager manualId="m-1" sectionId="sec-1" fields={fields} />,
  );
}

describe("WelcomeManualSectionFieldManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the empty state when there are no fields", () => {
    renderManager([]);
    expect(screen.getByTestId("welcome-manual-field-empty-state")).toBeInTheDocument();
    expect(screen.queryByTestId("welcome-manual-field-list")).not.toBeInTheDocument();
  });

  it("creates a field seeded with the default label when Add field is clicked", async () => {
    createFieldMock.mockReturnValue({ unwrap: () => Promise.resolve(makeField()) });
    renderManager([]);

    await userEvent.click(screen.getByTestId("welcome-manual-field-add-button"));

    await waitFor(() => {
      expect(createFieldMock).toHaveBeenCalledWith({
        manualId: "m-1",
        sectionId: "sec-1",
        data: { label: NEW_FIELD_DEFAULT_LABEL, value: null },
      });
    });
  });

  it("renders an existing field row with its label and value", () => {
    renderManager([makeField()]);
    const label = screen.getByTestId("welcome-manual-field-label") as HTMLInputElement;
    const value = screen.getByTestId("welcome-manual-field-value") as HTMLInputElement;
    expect(label.value).toBe("Wi-Fi network");
    expect(value.value).toBe("Lakeview");
  });

  it("saves a dirty-only PATCH when a value is edited and blurred", async () => {
    updateFieldMock.mockReturnValue({ unwrap: () => Promise.resolve(makeField()) });
    renderManager([makeField()]);

    const value = screen.getByTestId("welcome-manual-field-value");
    await userEvent.clear(value);
    await userEvent.type(value, "Harbor");
    await userEvent.tab();

    await waitFor(() => {
      expect(updateFieldMock).toHaveBeenCalledWith({
        manualId: "m-1",
        sectionId: "sec-1",
        fieldId: "fld-1",
        value: "Harbor",
      });
    });
  });

  it("does not save on blur when the value is unchanged", async () => {
    renderManager([makeField()]);
    const value = screen.getByTestId("welcome-manual-field-value");
    await userEvent.click(value);
    await userEvent.tab();
    expect(updateFieldMock).not.toHaveBeenCalled();
  });

  it("disables the Add field button once the section hits the field cap", () => {
    const fields = Array.from({ length: MAX_FIELDS_PER_SECTION }, (_, i) =>
      makeField({ id: `fld-${i}`, display_order: i }),
    );
    renderManager(fields);
    expect(screen.getByTestId("welcome-manual-field-add-button")).toBeDisabled();
  });
});
