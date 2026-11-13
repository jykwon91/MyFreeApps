import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ORGANIZATION_NAME_MAX_LENGTH } from "@mybookkeeper/api-client/constants/organizationName";
import CreateOrgPrompt from "@/app/features/organizations/CreateOrgPrompt";
import { CREATE_ORGANIZATION_MESSAGES } from "@/shared/lib/organization-messages";

const mockCreate = vi.fn();
const mutationState: { isLoading: boolean; error: unknown } = { isLoading: false, error: undefined };

vi.mock("@mybookkeeper/api-client/store/organizationsApi", () => ({
  useCreateOrganizationMutation: () => [mockCreate, mutationState],
}));

describe("CreateOrgPrompt", () => {
  beforeEach(() => {
    mockCreate.mockReset();
    mutationState.error = undefined;
  });

  it("says why creating failed, or that it did when the server gives no reason", () => {
    mutationState.error = { status: 403, data: { detail: "Demo accounts can't do that." } };
    const { rerender } = render(<CreateOrgPrompt />);
    expect(screen.getByText("Demo accounts can't do that.")).toBeInTheDocument();
    mutationState.error = { status: undefined, data: "Network Error" };
    rerender(<CreateOrgPrompt />);
    expect(screen.getByText(CREATE_ORGANIZATION_MESSAGES.couldntCreate)).toBeInTheDocument();
  });

  it("asks for a name instead of sending only spaces", async () => {
    const user = userEvent.setup();
    render(<CreateOrgPrompt />);
    await user.type(screen.getByPlaceholderText("e.g. My Properties LLC"), "   ");
    await user.click(screen.getByRole("button", { name: "Create organization" }));
    expect(screen.getByText("Enter a name.")).toBeInTheDocument();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("sends the trimmed name, capped at the column's length", async () => {
    const user = userEvent.setup();
    render(<CreateOrgPrompt />);
    const field = screen.getByPlaceholderText("e.g. My Properties LLC");
    expect(field).toHaveAttribute("maxLength", String(ORGANIZATION_NAME_MAX_LENGTH));
    await user.type(field, "  New Co ");
    await user.click(screen.getByRole("button", { name: "Create organization" }));
    expect(mockCreate).toHaveBeenCalledWith({ name: "New Co" });
  });
});
