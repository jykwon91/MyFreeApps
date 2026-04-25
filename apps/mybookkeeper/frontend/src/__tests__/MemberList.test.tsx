import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MemberList from "@/app/features/organizations/MemberList";
import type { OrgMember } from "@/shared/types/organization/member";

const mockUpdateRole = vi.fn(() => ({ unwrap: () => Promise.resolve({}) }));
const mockRemoveMember = vi.fn(() => ({ unwrap: () => Promise.resolve() }));

vi.mock("@/shared/store/membersApi", () => ({
  useListMembersQuery: vi.fn(),
  useUpdateMemberRoleMutation: vi.fn(() => [mockUpdateRole, { isLoading: false }]),
  useRemoveMemberMutation: vi.fn(() => [mockRemoveMember, { isLoading: false }]),
}));

vi.mock("@/shared/hooks/useCurrentOrg", () => ({
  useActiveOrgId: vi.fn(() => "org-1"),
}));

vi.mock("@/shared/hooks/useOrgRole", () => ({
  useIsOrgAdmin: vi.fn(() => true),
  useCanWrite: vi.fn(() => true),
}));

vi.mock("@/shared/hooks/useCurrentUser", () => ({
  useCurrentUser: vi.fn(() => ({ user: { id: "user-1", email: "me@test.com", name: "Me", role: "user", is_active: true }, isLoading: false })),
}));

import { useListMembersQuery } from "@/shared/store/membersApi";

function makeMember(overrides: Partial<OrgMember> = {}): OrgMember {
  return {
    id: crypto.randomUUID(),
    organization_id: "org-1",
    user_id: "user-2",
    org_role: "user",
    joined_at: "2024-01-01T00:00:00Z",
    user_email: "other@test.com",
    user_name: "Other User",
    ...overrides,
  };
}

describe("MemberList", () => {
  const onError = vi.fn();
  const onSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders members table with name and email", () => {
    const members = [
      makeMember({ user_id: "user-1", user_email: "me@test.com", user_name: "Me", org_role: "owner" }),
      makeMember({ user_id: "user-2", user_email: "other@test.com", user_name: "Other User" }),
    ];
    vi.mocked(useListMembersQuery).mockReturnValue({
      data: members,
      isLoading: false,
    } as unknown as ReturnType<typeof useListMembersQuery>);

    render(<MemberList onError={onError} onSuccess={onSuccess} />);

    expect(screen.getByText("Me")).toBeInTheDocument();
    expect(screen.getByText("me@test.com")).toBeInTheDocument();
    expect(screen.getByText("Other User")).toBeInTheDocument();
    expect(screen.getByText("other@test.com")).toBeInTheDocument();
  });

  it("shows remove button for other members but not self", () => {
    const members = [
      makeMember({ user_id: "user-1", user_email: "me@test.com", user_name: "Me", org_role: "owner" }),
      makeMember({ user_id: "user-2", user_email: "other@test.com" }),
    ];
    vi.mocked(useListMembersQuery).mockReturnValue({
      data: members,
      isLoading: false,
    } as unknown as ReturnType<typeof useListMembersQuery>);

    render(<MemberList onError={onError} onSuccess={onSuccess} />);

    expect(screen.getByText("You")).toBeInTheDocument();
    expect(screen.getByText("Remove")).toBeInTheDocument();
  });

  it("shows empty message when no members", () => {
    vi.mocked(useListMembersQuery).mockReturnValue({
      data: [],
      isLoading: false,
    } as unknown as ReturnType<typeof useListMembersQuery>);

    render(<MemberList onError={onError} onSuccess={onSuccess} />);

    expect(screen.getByText("No members yet.")).toBeInTheDocument();
  });

  it("opens confirm dialog when remove is clicked", async () => {
    const user = userEvent.setup();
    const members = [makeMember({ user_id: "user-2", user_email: "other@test.com" })];
    vi.mocked(useListMembersQuery).mockReturnValue({
      data: members,
      isLoading: false,
    } as unknown as ReturnType<typeof useListMembersQuery>);

    render(<MemberList onError={onError} onSuccess={onSuccess} />);

    await user.click(screen.getByText("Remove"));

    expect(screen.getByText("Remove member")).toBeInTheDocument();
    expect(screen.getByText(/Are you sure you want to remove other@test.com/)).toBeInTheDocument();
  });
});
