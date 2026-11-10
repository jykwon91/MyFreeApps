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
import { render, screen, waitFor, act } from "@testing-library/react";
import { showError } from "@platform/ui";
import { WELCOME_MANUAL_STALE_ORDER_MESSAGE } from "@mybookkeeper/api-client/constants/welcomeManualLimits";
import userEvent from "@testing-library/user-event";
import WelcomeManualSectionFieldManager from "@/app/features/welcome-manuals/WelcomeManualSectionFieldManager";
import { MAX_FIELDS_PER_SECTION } from "@mybookkeeper/api-client/constants/welcomeManualLimits";
import { NEW_FIELD_DEFAULT_LABEL } from "@/shared/lib/welcome-manual-constants";
import type { WelcomeManualSectionFieldResponse } from "@mybookkeeper/api-client/types/welcome-manual/welcome-manual-section-field-response";

const createFieldMock = vi.fn();
const updateFieldMock = vi.fn();
const reorderFieldsMock = vi.fn();
const deleteFieldMock = vi.fn();

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
  useCreateSectionFieldMutation: vi.fn(() => [createFieldMock, { isLoading: false }]),
  useUpdateSectionFieldMutation: vi.fn(() => [updateFieldMock, { isLoading: false }]),
  useDeleteSectionFieldMutation: vi.fn(() => [deleteFieldMock, { isLoading: false }]),
  useReorderSectionFieldsMutation: vi.fn(() => [reorderFieldsMock, { isLoading: false }]),
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
        data: { value: "Harbor" },
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

  it("shows the stale-order copy when a reorder is rejected with 409", async () => {
    reorderFieldsMock.mockReturnValue({ unwrap: () => Promise.reject({ status: 409 }) });
    renderManager([makeField({ id: "f-a" }), makeField({ id: "f-b", display_order: 1 })]);

    await act(async () => {
      await capturedDragEnd?.({ active: { id: "f-a" }, over: { id: "f-b" } });
    });

    expect(showError).toHaveBeenCalledWith(WELCOME_MANUAL_STALE_ORDER_MESSAGE);
  });
});
