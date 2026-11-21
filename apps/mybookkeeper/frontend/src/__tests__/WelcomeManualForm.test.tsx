import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WelcomeManualForm from "@/app/features/welcome-manuals/WelcomeManualForm";
import type { WelcomeManualResponse } from "@mybookkeeper/api-client/types/welcome-manual/welcome-manual-response";

const updateManualMock = vi.fn();

vi.mock("@mybookkeeper/api-client/store/welcomeManualsApi", () => ({
  useUpdateWelcomeManualMutation: () => [updateManualMock, { isLoading: false }],
}));

const TIMESTAMP = "2026-01-01T00:00:00Z";

const MANUAL: WelcomeManualResponse = {
  id: "m-1",
  organization_id: "org-1",
  user_id: "user-1",
  property_id: null,
  title: "Guide",
  intro_text: null,
  rooms: [],
  sections: [],
  places: [],
  share_token: null,
  share_pin: null,
  created_at: TIMESTAMP,
  updated_at: TIMESTAMP,
};

describe("WelcomeManualForm", () => {
  it("links the title error to the title field", async () => {
    render(<WelcomeManualForm manual={MANUAL} properties={[]} onClose={vi.fn()} onUpdated={vi.fn()} />);
    const title = screen.getByTestId("welcome-manual-edit-title");
    await userEvent.clear(title);
    await userEvent.click(screen.getByTestId("welcome-manual-edit-submit"));
    expect(title).toBeInvalid();
    expect(title).toHaveAccessibleDescription(/\S/);
    expect(updateManualMock).not.toHaveBeenCalled();
  });
});
