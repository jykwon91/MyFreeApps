import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OrgSwitcher from "@/app/features/organizations/OrgSwitcher";
import type { OrgWithRole } from "@/shared/types/organization/org-with-role";

const mockDispatch = vi.fn();

vi.mock("react-redux", () => ({
  useSelector: vi.fn(),
  useDispatch: () => mockDispatch,
}));

vi.mock("@/shared/store/organizationsApi", () => ({
  useCreateOrganizationMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
}));

vi.mock("@/shared/store/organizationSlice", () => ({
  switchOrg: vi.fn((id: string) => ({ type: "switchOrg", payload: id })),
}));

vi.mock("@/shared/hooks/useCurrentOrg", () => ({
  useCurrentOrg: vi.fn(),
}));

import { useSelector } from "react-redux";
import { useCurrentOrg } from "@/shared/hooks/useCurrentOrg";

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

  it("returns null when no current org", () => {
    vi.mocked(useCurrentOrg).mockReturnValue(null);
    const { container } = render(<OrgSwitcher />);

    expect(container.firstChild).toBeNull();
  });
});
