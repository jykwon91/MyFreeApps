import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import PendingInvites from "@/app/features/organizations/PendingInvites";
import type { OrgInvite } from "@/shared/types/organization/invite";

vi.mock("@/shared/store/membersApi", () => ({
  useListInvitesQuery: vi.fn(),
}));

vi.mock("@/shared/hooks/useCurrentOrg", () => ({
  useActiveOrgId: vi.fn(() => "org-1"),
}));

import { useListInvitesQuery } from "@/shared/store/membersApi";

function makeInvite(overrides: Partial<OrgInvite> = {}): OrgInvite {
  return {
    id: crypto.randomUUID(),
    organization_id: "org-1",
    email: "invited@test.com",
    org_role: "user",
    status: "pending",
    email_sent: true,
    created_at: "2024-01-01T00:00:00Z",
    expires_at: new Date(Date.now() + 86400000 * 7).toISOString(),
    ...overrides,
  };
}

describe("PendingInvites", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders pending invites", () => {
    vi.mocked(useListInvitesQuery).mockReturnValue({
      data: [makeInvite({ email: "test@example.com" })],
      isLoading: false,
    } as unknown as ReturnType<typeof useListInvitesQuery>);

    render(<PendingInvites />);

    expect(screen.getByText("test@example.com")).toBeInTheDocument();
    expect(screen.getByText("pending")).toBeInTheDocument();
  });

  it("shows empty message when no pending invites", () => {
    vi.mocked(useListInvitesQuery).mockReturnValue({
      data: [],
      isLoading: false,
    } as unknown as ReturnType<typeof useListInvitesQuery>);

    render(<PendingInvites />);

    expect(screen.getByText("No pending invites.")).toBeInTheDocument();
  });

  it("filters out non-pending invites", () => {
    vi.mocked(useListInvitesQuery).mockReturnValue({
      data: [
        makeInvite({ email: "pending@test.com", status: "pending" }),
        makeInvite({ email: "accepted@test.com", status: "accepted" }),
        makeInvite({ email: "expired@test.com", status: "expired" }),
      ],
      isLoading: false,
    } as unknown as ReturnType<typeof useListInvitesQuery>);

    render(<PendingInvites />);

    expect(screen.getByText("pending@test.com")).toBeInTheDocument();
    expect(screen.queryByText("accepted@test.com")).not.toBeInTheDocument();
    expect(screen.queryByText("expired@test.com")).not.toBeInTheDocument();
  });
});
