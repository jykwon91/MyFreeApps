/**
 * Unit tests for the welcome-manual create dialog.
 *
 * Verifies:
 *   - The "start with common sections" seed checkbox defaults to CHECKED.
 *   - Submitting sends seed_default_sections=true by default and calls
 *     onCreated with the created manual.
 *   - Unchecking the seed box sends seed_default_sections=false.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WelcomeManualCreateDialog from "@/app/features/welcome-manuals/WelcomeManualCreateDialog";
import type { Property } from "@/shared/types/property/property";
import type { WelcomeManualResponse } from "@/shared/types/welcome-manual/welcome-manual-response";

const createMutationMock = vi.fn();

vi.mock("@/shared/lib/toast-store", () => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

vi.mock("@/shared/store/welcomeManualsApi", () => ({
  useCreateWelcomeManualMutation: vi.fn(() => [createMutationMock, { isLoading: false }]),
}));

const PROPERTY: Property = {
  id: "prop-1",
  name: "Lakeview Suite",
  address: null,
  classification: "investment",
  type: "short_term",
  is_active: true,
  activity_periods: [],
  created_at: "2026-01-01T00:00:00Z",
};

const CREATED: WelcomeManualResponse = {
  id: "m-new",
  organization_id: "org-1",
  user_id: "user-1",
  property_id: null,
  title: "My Guide",
  intro_text: null,
  sections: [],
  places: [],
  share_token: null,
  share_pin: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("WelcomeManualCreateDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("defaults the seed checkbox to checked", () => {
    render(
      <WelcomeManualCreateDialog
        properties={[PROPERTY]}
        onClose={vi.fn()}
        onCreated={vi.fn()}
      />,
    );
    const seed = screen.getByTestId("welcome-manual-create-seed");
    expect(seed).toBeChecked();
  });

  it("creates with seed_default_sections=true by default and calls onCreated", async () => {
    createMutationMock.mockReturnValue({ unwrap: () => Promise.resolve(CREATED) });
    const onCreated = vi.fn();
    render(
      <WelcomeManualCreateDialog
        properties={[PROPERTY]}
        onClose={vi.fn()}
        onCreated={onCreated}
      />,
    );

    await userEvent.type(screen.getByTestId("welcome-manual-create-title"), "My Guide");
    await userEvent.click(screen.getByTestId("welcome-manual-create-submit"));

    await waitFor(() => {
      expect(createMutationMock).toHaveBeenCalledWith({
        title: "My Guide",
        property_id: null,
        seed_default_sections: true,
      });
      expect(onCreated).toHaveBeenCalledWith(CREATED);
    });
  });

  it("sends seed_default_sections=false when the seed box is unchecked", async () => {
    createMutationMock.mockReturnValue({ unwrap: () => Promise.resolve(CREATED) });
    render(
      <WelcomeManualCreateDialog
        properties={[PROPERTY]}
        onClose={vi.fn()}
        onCreated={vi.fn()}
      />,
    );

    await userEvent.type(screen.getByTestId("welcome-manual-create-title"), "Blank Guide");
    await userEvent.click(screen.getByTestId("welcome-manual-create-seed"));
    await userEvent.selectOptions(screen.getByTestId("welcome-manual-create-property"), "prop-1");
    await userEvent.click(screen.getByTestId("welcome-manual-create-submit"));

    await waitFor(() => {
      expect(createMutationMock).toHaveBeenCalledWith({
        title: "Blank Guide",
        property_id: "prop-1",
        seed_default_sections: false,
      });
    });
  });
});
