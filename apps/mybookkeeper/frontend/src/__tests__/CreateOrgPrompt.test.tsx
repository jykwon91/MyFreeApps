import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ORGANIZATION_NAME_MAX_LENGTH } from "@mybookkeeper/api-client/constants/organizationName";
import CreateOrgPrompt from "@/app/features/organizations/CreateOrgPrompt";

const mockCreate = vi.fn();

vi.mock("@mybookkeeper/api-client/store/organizationsApi", () => ({
  useCreateOrganizationMutation: () => [mockCreate, { isLoading: false, error: undefined }],
}));

describe("CreateOrgPrompt", () => {
  beforeEach(() => {
    mockCreate.mockReset();
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
