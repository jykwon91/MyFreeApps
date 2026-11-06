import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MemberList from "@/app/features/organizations/MemberList";
import type { OrgMember } from "@mybookkeeper/api-client/types/organization/OrgMember";

const mockUpdateRole = vi.fn(() => ({ unwrap: () => Promise.resolve({}) }));
const mockRemoveMember = vi.fn(() => ({ unwrap: () => Promise.resolve() }));

vi.mock("@mybookkeeper/api-client/store/membersApi", () => ({
  useListMembersQuery: vi.fn(),
  useUpdateMemberRoleMutation: vi.fn(() => [mockUpdateRole, { isLoading: false }]),
  useRemoveMemberMutation: vi.fn(() => [mockRemoveMember, { isLoading: false }]),
}));

vi.mock("@/shared/hooks/useCurrentOrg", () => ({
  useActiveOrgId: vi.fn(() => "org-1"),
}));

vi.mock("@/shared/hooks/useOrgRole", () => ({
  useIsOrgAdmin: vi.fn(() => true),
  useOrgRole: vi.fn(() => "owner"),
  useCanWrite: vi.fn(() => true),
}));

vi.mock("@/shared/hooks/useCurrentUser", () => ({
  useCurrentUser: vi.fn(() => ({ user: { id: "user-1", email: "me@test.com", name: "Me", role: "user", is_active: true }, isLoading: false })),
}));

import { useListMembersQuery } from "@mybookkeeper/api-client/store/membersApi";
import { useOrgRole } from "@/shared/hooks/useOrgRole";

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
    vi.mocked(useOrgRole).mockReturnValue("owner");
  });

  it("falls back to the email when a member's name is blank", () => {
    vi.mocked(useListMembersQuery).mockReturnValue({
      data: [makeMember({ user_email: "blank@test.com", user_name: "" })],
      isLoading: false,
    } as unknown as ReturnType<typeof useListMembersQuery>);

    render(<MemberList onError={onError} onSuccess={onSuccess} />);

    expect(screen.getAllByText("blank@test.com").length).toBeGreaterThan(0);
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

  it("offers no role change or removal on the owner's row", () => {
    vi.mocked(useOrgRole).mockReturnValue("admin");
    const members = [
      makeMember({ user_id: "user-2", user_email: "owner@test.com", user_name: "Owner", org_role: "owner" }),
      makeMember({ user_id: "user-1", user_email: "me@test.com", user_name: "Me", org_role: "admin" }),
    ];
    vi.mocked(useListMembersQuery).mockReturnValue({
      data: members,
      isLoading: false,
    } as unknown as ReturnType<typeof useListMembersQuery>);

    render(<MemberList onError={onError} onSuccess={onSuccess} />);

    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByText("Remove")).not.toBeInTheDocument();
    expect(screen.getByText("Owner", { selector: "span" })).toBeInTheDocument();
  });

  it("lets an admin manage users but not another admin", () => {
    vi.mocked(useOrgRole).mockReturnValue("admin");
    vi.mocked(useListMembersQuery).mockReturnValue({
      data: [
        makeMember({ user_id: "user-1", user_email: "me@test.com", user_name: "Me", org_role: "admin" }),
        makeMember({ user_id: "user-2", user_email: "admin2@test.com", user_name: "Ada", org_role: "admin" }),
        makeMember({ user_id: "user-3", user_email: "user@test.com", user_name: "Uma", org_role: "user" }),
      ],
      isLoading: false,
    } as unknown as ReturnType<typeof useListMembersQuery>);

    render(<MemberList onError={onError} onSuccess={onSuccess} />);

    expect(screen.queryByRole("combobox", { name: /Ada/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Remove Ada/ })).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /Uma/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Remove Uma/ })).toBeInTheDocument();
  });

  it("lets the owner change or remove an admin", () => {
    vi.mocked(useListMembersQuery).mockReturnValue({
      data: [
        makeMember({ user_id: "user-1", user_email: "me@test.com", user_name: "Me", org_role: "owner" }),
        makeMember({ user_id: "user-2", user_email: "admin2@test.com", user_name: "Ada", org_role: "admin" }),
      ],
      isLoading: false,
    } as unknown as ReturnType<typeof useListMembersQuery>);

    render(<MemberList onError={onError} onSuccess={onSuccess} />);

    expect(screen.getByRole("combobox", { name: /Ada/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Remove Ada/ })).toBeInTheDocument();
  });

  it("never offers Owner as a role to assign", () => {
    const members = [
      makeMember({ user_id: "user-1", user_email: "me@test.com", user_name: "Me", org_role: "owner" }),
      makeMember({ user_id: "user-2", user_email: "other@test.com", org_role: "user" }),
    ];
    vi.mocked(useListMembersQuery).mockReturnValue({
      data: members,
      isLoading: false,
    } as unknown as ReturnType<typeof useListMembersQuery>);

    render(<MemberList onError={onError} onSuccess={onSuccess} />);

    const options = screen.getAllByRole("option").map((o) => (o as HTMLOptionElement).value);
    expect(options).toEqual(["admin", "user", "viewer"]);
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

    expect(screen.getByRole("combobox", { name: "Role for Other User" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove Other User" }));

    expect(screen.getByText("Remove member")).toBeInTheDocument();
    expect(screen.getByText(/Are you sure you want to remove other@test.com/)).toBeInTheDocument();
    expect(screen.getByText(/If they connected this workspace's Gmail, it's disconnected too/)).toBeInTheDocument();
  });
});
