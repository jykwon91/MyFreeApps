import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import InviteAccept from "@/app/pages/InviteAccept";
import type { InviteInfo } from "@/shared/types/organization/invite";

vi.mock("@/shared/store/membersApi", () => ({
  useAcceptInviteMutation: vi.fn(() => [
    vi.fn(() => ({ unwrap: () => Promise.resolve(undefined) })),
    {} as never,
  ]),
  useGetInviteInfoQuery: vi.fn(),
}));

vi.mock("@/shared/hooks/useCurrentUser", () => ({
  useCurrentUser: vi.fn(),
}));

vi.mock("@/shared/lib/auth", () => ({
  login: vi.fn(),
  notifyAuthChange: vi.fn(),
}));

vi.mock("@/shared/lib/api", () => ({
  default: { post: vi.fn() },
}));

vi.mock("@/shared/components/ui/TurnstileWidget", () => ({
  default: () => null,
}));

import { useGetInviteInfoQuery } from "@/shared/store/membersApi";
import { useCurrentUser } from "@/shared/hooks/useCurrentUser";

function makeInviteInfo(overrides: Partial<InviteInfo> = {}): InviteInfo {
  return {
    org_name: "Acme Co",
    org_role: "user",
    inviter_name: "Alice",
    email: "invitee@test.com",
    expires_at: new Date(Date.now() + 86400000 * 7).toISOString(),
    is_expired: false,
    user_exists: true,
    ...overrides,
  };
}

function mockInviteQuery(overrides: {
  data?: InviteInfo;
  isLoading?: boolean;
  error?: unknown;
}) {
  vi.mocked(useGetInviteInfoQuery).mockReturnValue({
    data: overrides.data,
    isLoading: overrides.isLoading ?? false,
    error: overrides.error,
  } as unknown as ReturnType<typeof useGetInviteInfoQuery>);
}

function mockCurrentUser(email: string | null) {
  vi.mocked(useCurrentUser).mockReturnValue({
    user: email ? ({ email } as never) : null,
    isLoading: false,
    isError: false,
    error: undefined,
  });
}

function renderWithToken(token: string) {
  return render(
    <MemoryRouter initialEntries={[`/invite/${token}`]}>
      <Routes>
        <Route path="/invite/:token" element={<InviteAccept />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("InviteAccept", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows skeleton placeholders while invite info is loading", () => {
    mockInviteQuery({ isLoading: true });
    mockCurrentUser(null);

    const { container } = renderWithToken("any-token");

    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("shows 'Invite not found' when the query errors", () => {
    mockInviteQuery({ error: { status: 404 } });
    mockCurrentUser(null);

    renderWithToken("bad-token");

    expect(screen.getByText("Invite not found")).toBeInTheDocument();
  });

  it("shows 'Invite expired' when the invite is expired", () => {
    mockInviteQuery({ data: makeInviteInfo({ is_expired: true }) });
    mockCurrentUser(null);

    renderWithToken("expired-token");

    expect(screen.getByText("Invite expired")).toBeInTheDocument();
  });

  it("shows the joining state when authenticated as the invited email", () => {
    mockInviteQuery({ data: makeInviteInfo({ email: "match@test.com" }) });
    mockCurrentUser("match@test.com");

    renderWithToken("good-token");

    expect(screen.getByText("Joining Acme Co...")).toBeInTheDocument();
  });

  it("shows the wrong-user prompt when authed as a different email", () => {
    mockInviteQuery({ data: makeInviteInfo({ email: "intended@test.com" }) });
    mockCurrentUser("other@test.com");

    renderWithToken("good-token");

    expect(
      screen.getByRole("button", { name: /Sign out and continue as intended@test.com/i })
    ).toBeInTheDocument();
  });

  it("shows the login form when the invitee already has an account", () => {
    mockInviteQuery({ data: makeInviteInfo({ user_exists: true }) });
    mockCurrentUser(null);

    renderWithToken("good-token");

    expect(screen.getByRole("button", { name: /Sign in & join Acme Co/i })).toBeInTheDocument();
  });

  it("shows the registration form when the invitee is new", () => {
    mockInviteQuery({ data: makeInviteInfo({ user_exists: false }) });
    mockCurrentUser(null);

    renderWithToken("good-token");

    expect(
      screen.getByRole("button", { name: /Create account & join Acme Co/i })
    ).toBeInTheDocument();
  });
});
