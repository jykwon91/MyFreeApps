import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PendingInvites from "@/app/features/organizations/PendingInvites";
import type { OrgInvite } from "@mybookkeeper/api-client/types/organization/OrgInvite";

const mockCancel = vi.fn();

vi.mock("@mybookkeeper/api-client/store/membersApi", () => ({
  useListInvitesQuery: vi.fn(),
  useCancelInviteMutation: vi.fn(() => [mockCancel, { isLoading: false }]),
}));

vi.mock("@/shared/hooks/useCurrentOrg", () => ({
  useActiveOrgId: vi.fn(() => "org-1"),
}));

import { useListInvitesQuery } from "@mybookkeeper/api-client/store/membersApi";

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

function showInvites(invites: OrgInvite[]) {
  vi.mocked(useListInvitesQuery).mockReturnValue({
    data: invites,
    isLoading: false,
  } as unknown as ReturnType<typeof useListInvitesQuery>);
}

function cancelSucceeds() {
  mockCancel.mockReturnValueOnce({ unwrap: () => Promise.resolve(undefined) });
}

function cancelFails(error: unknown) {
  mockCancel.mockReturnValueOnce({ unwrap: () => Promise.reject(error) });
}

describe("PendingInvites", () => {
  const onSuccess = vi.fn();
  const onError = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders pending invites", () => {
    showInvites([makeInvite({ email: "test@example.com" })]);
    render(<PendingInvites />);

    expect(screen.getByText("test@example.com")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.queryByText("Email didn't send")).not.toBeInTheDocument();
  });

  it("shows empty message when no pending invites", () => {
    showInvites([]);
    render(<PendingInvites />);

    expect(screen.getByText("No pending invites.")).toBeInTheDocument();
  });

  it("filters out accepted invites", () => {
    showInvites([
      makeInvite({ email: "pending@test.com", status: "pending" }),
      makeInvite({ email: "accepted@test.com", status: "accepted" }),
    ]);
    render(<PendingInvites />);

    expect(screen.getByText("pending@test.com")).toBeInTheDocument();
    expect(screen.queryByText("accepted@test.com")).not.toBeInTheDocument();
  });

  it("marks a pending invite past its expiry as Expired, since it can no longer be accepted", () => {
    showInvites([makeInvite({ email: "late@test.com", expires_at: new Date(Date.now() - 86400000).toISOString() })]);
    render(<PendingInvites />);

    expect(screen.getByText("Expired")).toBeInTheDocument();
    expect(screen.queryByText("Pending")).not.toBeInTheDocument();
  });

  it("flags an invite whose email didn't send", () => {
    showInvites([makeInvite({ email_sent: false })]);
    render(<PendingInvites />);

    expect(screen.getByText("Email didn't send")).toBeInTheDocument();
  });

  it("cancels an invite from its named button", async () => {
    const invite = makeInvite({ email: "bye@test.com" });
    showInvites([invite]);
    cancelSucceeds();
    render(<PendingInvites onSuccess={onSuccess} onError={onError} />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Cancel invite for bye@test.com" }));

    expect(mockCancel).toHaveBeenCalledWith({ orgId: "org-1", inviteId: invite.id });
    expect(onSuccess).toHaveBeenCalledWith("Invite for bye@test.com cancelled");
    expect(onError).not.toHaveBeenCalled();
  });

  it("says an invite is already gone on 404", async () => {
    showInvites([makeInvite({ email: "gone@test.com" })]);
    cancelFails({ status: 404, data: { detail: "Invite not found or already accepted" } });
    render(<PendingInvites onSuccess={onSuccess} onError={onError} />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Cancel invite for gone@test.com" }));

    expect(onError).toHaveBeenCalledWith("That invite is already gone.");
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("asks to try again when the cancel fails for another reason", async () => {
    showInvites([makeInvite({ email: "flaky@test.com" })]);
    cancelFails({ status: "FETCH_ERROR", error: "Network Error" });
    render(<PendingInvites onSuccess={onSuccess} onError={onError} />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Cancel invite for flaky@test.com" }));

    expect(onError).toHaveBeenCalledWith("I couldn't cancel that invite. Try again.");
  });

  it("passes on the server's reason when it refuses the cancel", async () => {
    showInvites([makeInvite({ email: "kept@test.com" })]);
    cancelFails({ status: 403, data: { detail: "Insufficient organization permissions" } });
    render(<PendingInvites onSuccess={onSuccess} onError={onError} />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Cancel invite for kept@test.com" }));

    expect(onError).toHaveBeenCalledWith("Insufficient organization permissions");
  });

  it("shows the cancel is in flight and ignores a second click", async () => {
    showInvites([makeInvite({ email: "slow@test.com" })]);
    let finish: () => void = () => {};
    mockCancel.mockReturnValueOnce({ unwrap: () => new Promise<void>((resolve) => { finish = resolve; }) });
    render(<PendingInvites onSuccess={onSuccess} onError={onError} />);
    const button = screen.getByRole("button", { name: "Cancel invite for slow@test.com" });

    const user = userEvent.setup();
    await user.click(button);
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    await user.click(button);
    expect(mockCancel).toHaveBeenCalledTimes(1);

    await act(async () => finish());
    expect(button).not.toBeDisabled();
    expect(onSuccess).toHaveBeenCalledWith("Invite for slow@test.com cancelled");
  });
});
