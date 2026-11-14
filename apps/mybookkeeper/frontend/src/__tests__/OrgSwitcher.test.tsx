import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OrgSwitcher from "@/app/features/organizations/OrgSwitcher";
import type { OrgWithRole } from "@mybookkeeper/api-client/types/organization/OrgWithRole";

const mockDispatch = vi.fn();

vi.mock("react-redux", () => ({
  useSelector: vi.fn(),
  useDispatch: () => mockDispatch,
}));

const mockCreate = vi.fn();

vi.mock("@mybookkeeper/api-client/store/organizationsApi", () => ({
  useCreateOrganizationMutation: vi.fn(() => [mockCreate, { isLoading: false }]),
}));

vi.mock("@platform/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@platform/ui")>()),
  showError: vi.fn(),
}));

vi.mock("@/shared/store/organizationSlice", () => ({
  switchOrg: vi.fn((id: string) => ({ type: "switchOrg", payload: id })),
}));

vi.mock("@/shared/hooks/useCurrentOrg", () => ({
  useCurrentOrg: vi.fn(),
}));

import { useSelector } from "react-redux";
import { showError } from "@platform/ui";
import { useCurrentOrg } from "@/shared/hooks/useCurrentOrg";
import { CREATE_ORGANIZATION_MESSAGES } from "@/shared/lib/organization-messages";

async function submitNewOrg(name: string): Promise<void> {
  const user = userEvent.setup();
  render(<OrgSwitcher />);
  await user.click(screen.getByText("First Org"));
  await user.click(screen.getByText("New organization"));
  await user.type(screen.getByPlaceholderText("Organization name"), name);
  await user.click(screen.getByRole("button", { name: "Create" }));
}

function answering(result: () => Promise<unknown>) {
  return { unwrap: result };
}

function makeOrg(overrides: Partial<OrgWithRole> = {}): OrgWithRole {
  return {
    id: "org-1",
    name: "Test Org",
    org_role: "owner",
    is_demo: false,
    created_at: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("OrgSwitcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const orgs = [
      makeOrg({ id: "org-1", name: "First Org" }),
      makeOrg({ id: "org-2", name: "Second Org", org_role: "user" }),
    ];
    vi.mocked(useSelector).mockReturnValue(orgs);
    vi.mocked(useCurrentOrg).mockReturnValue(orgs[0]);
  });

  it("renders the current org name and role", () => {
    render(<OrgSwitcher />);

    expect(screen.getByText("First Org")).toBeInTheDocument();
    expect(screen.getByText("Owner")).toBeInTheDocument();
  });

  it("shows dropdown with all orgs when clicked", async () => {
    const user = userEvent.setup();
    render(<OrgSwitcher />);

    await user.click(screen.getByText("First Org"));

    expect(screen.getByText("Second Org")).toBeInTheDocument();
  });

  it("closes the form once the organization is created", async () => {
    mockCreate.mockReturnValue(answering(() => Promise.resolve({ id: "org-3" })));
    await submitNewOrg("  Lake House ");
    expect(mockCreate).toHaveBeenCalledWith({ name: "Lake House" });
    await waitFor(() => expect(screen.queryByPlaceholderText("Organization name")).toBeNull());
    expect(showError).not.toHaveBeenCalled();
  });

  it.each([
    ["the server's reason", { status: 403, data: { detail: "Demo accounts can't do that." } }, "Demo accounts can't do that."],
    ["a general message when there's no reason", { status: undefined, data: "Network Error" }, CREATE_ORGANIZATION_MESSAGES.couldntCreate],
    ["a general message for a server error", { status: 500, data: { detail: [{ msg: "x" }] } }, CREATE_ORGANIZATION_MESSAGES.couldntCreate],
  ])("keeps the form open with the name and shows %s when creating fails", async (_case, error, message) => {
    mockCreate.mockReturnValue(answering(() => Promise.reject(error)));
    await submitNewOrg("Lake House");
    await waitFor(() => expect(showError).toHaveBeenCalledWith(message));
    expect(screen.getByPlaceholderText("Organization name")).toHaveValue("Lake House");
  });

  it("returns null when no current org", () => {
    vi.mocked(useCurrentOrg).mockReturnValue(null);
    const { container } = render(<OrgSwitcher />);

    expect(container.firstChild).toBeNull();
  });
});
