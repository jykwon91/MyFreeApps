import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import InviteAccept from "@/app/pages/InviteAccept";
import type { InviteInfo } from "@mybookkeeper/api-client/types/organization/InviteInfo";

vi.mock("@mybookkeeper/api-client/store/membersApi", () => ({
  useAcceptInviteMutation: vi.fn(),
  useGetInviteInfoQuery: vi.fn(),
}));

vi.mock("@/shared/hooks/useCurrentUser", () => ({
  useCurrentUser: vi.fn(),
}));

vi.mock("@/shared/lib/auth", () => ({
  login: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@/shared/lib/api", () => ({
  default: { post: vi.fn() },
}));

vi.mock("@platform/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@platform/ui")>()),
  TurnstileWidget: () => null,
}));

import { useAcceptInviteMutation, useGetInviteInfoQuery } from "@mybookkeeper/api-client/store/membersApi";
import { useCurrentUser } from "@/shared/hooks/useCurrentUser";
import { login, signOut } from "@/shared/lib/auth";
import api from "@/shared/lib/api";

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

function LocationProbe() {
  return <div data-testid="path">{useLocation().pathname}</div>;
}

const ALREADY_MEMBER_ERROR = { status: 400, data: { detail: "Already a member of this organization" } };
const NOT_FOUND_ERROR = { status: 404, data: { detail: "Invite not found or expired" } };

type AcceptOutcome = { ok: true } | { ok: false; error: unknown };

/** Makes each accept call settle with the next outcome (the last one repeats). */
function mockAccept(...outcomes: AcceptOutcome[]) {
  const trigger = vi.fn();
  vi.mocked(useAcceptInviteMutation).mockReturnValue([
    (token: string) => {
      const outcome = outcomes[Math.min(trigger.mock.calls.length, outcomes.length - 1)];
      trigger(token);
      return { unwrap: () => (outcome.ok ? Promise.resolve({}) : Promise.reject(outcome.error)) };
    },
    {} as never,
  ] as unknown as ReturnType<typeof useAcceptInviteMutation>);
  return trigger;
}

function inviteRoutes(token: string) {
  return (
    <MemoryRouter initialEntries={[`/invite/${token}`]}>
      <Routes>
        <Route path="/invite/:token" element={<InviteAccept />} />
        <Route path="/" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>
  );
}

function renderWithToken(token: string) {
  return render(inviteRoutes(token));
}

describe("InviteAccept", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAccept({ ok: true });
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

  it("signs out through the shared sign-out path, then reloads, from the wrong-user prompt", () => {
    const originalLocation = window.location;
    const reload = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, reload },
    });
    mockInviteQuery({ data: makeInviteInfo({ email: "intended@test.com" }) });
    mockCurrentUser("other@test.com");

    renderWithToken("good-token");
    fireEvent.click(screen.getByRole("button", { name: /Sign out and continue as intended@test.com/i }));

    Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
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

  describe("accepting", () => {
    it("goes to the dashboard when the signed-in invitee is accepted", async () => {
      mockInviteQuery({ data: makeInviteInfo({ email: "match@test.com" }) });
      mockCurrentUser("match@test.com");
      const accept = mockAccept({ ok: true });

      renderWithToken("good-token");

      expect(await screen.findByTestId("path")).toHaveTextContent("/");
      expect(accept).toHaveBeenCalledWith("good-token");
    });

    it("shows the error and stays on the invite when accepting fails for the signed-in invitee", async () => {
      mockInviteQuery({ data: makeInviteInfo({ email: "match@test.com" }) });
      mockCurrentUser("match@test.com");
      const accept = mockAccept({ ok: false, error: NOT_FOUND_ERROR });

      renderWithToken("good-token");

      expect(await screen.findByText("Invite not found or expired")).toBeInTheDocument();
      expect(screen.queryByTestId("path")).not.toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Go to dashboard" })).toHaveAttribute("href", "/");
      expect(accept).toHaveBeenCalledTimes(1);
    });

    it("shows the shared fallback message when the failure carries none", async () => {
      mockInviteQuery({ data: makeInviteInfo({ email: "match@test.com" }) });
      mockCurrentUser("match@test.com");
      mockAccept({ ok: false, error: { status: "FETCH_ERROR" } });

      renderWithToken("good-token");

      expect(await screen.findByText("An unexpected error occurred")).toBeInTheDocument();
    });

    it("retries with Try again, then goes to the dashboard", async () => {
      mockInviteQuery({ data: makeInviteInfo({ email: "match@test.com" }) });
      mockCurrentUser("match@test.com");
      const accept = mockAccept({ ok: false, error: NOT_FOUND_ERROR }, { ok: true });

      renderWithToken("good-token");
      fireEvent.click(await screen.findByRole("button", { name: "Try again" }));

      expect(await screen.findByTestId("path")).toHaveTextContent("/");
      expect(accept).toHaveBeenCalledTimes(2);
    });

    it("disables Try again while the retry is in flight", async () => {
      mockInviteQuery({ data: makeInviteInfo({ email: "match@test.com" }) });
      mockCurrentUser("match@test.com");
      let release!: () => void;
      const pending = new Promise<unknown>((resolve) => {
        release = () => resolve({});
      });
      let calls = 0;
      vi.mocked(useAcceptInviteMutation).mockReturnValue([
        () => ({ unwrap: () => (calls++ === 0 ? Promise.reject(NOT_FOUND_ERROR) : pending) }),
        {} as never,
      ] as unknown as ReturnType<typeof useAcceptInviteMutation>);

      renderWithToken("good-token");
      fireEvent.click(await screen.findByRole("button", { name: "Try again" }));

      expect(await screen.findByRole("button", { name: "Trying again..." })).toBeDisabled();
      release();
      expect(await screen.findByTestId("path")).toBeInTheDocument();
    });

    it("treats 'Already a member' as success and goes to the dashboard", async () => {
      mockInviteQuery({ data: makeInviteInfo({ email: "match@test.com" }) });
      mockCurrentUser("match@test.com");
      mockAccept({ ok: false, error: ALREADY_MEMBER_ERROR });

      renderWithToken("good-token");

      expect(await screen.findByTestId("path")).toHaveTextContent("/");
    });

    it("does not treat a different 400 as already a member", async () => {
      mockInviteQuery({ data: makeInviteInfo({ email: "match@test.com" }) });
      mockCurrentUser("match@test.com");
      mockAccept({ ok: false, error: { status: 400, data: { detail: "Invite has expired" } } });

      renderWithToken("good-token");

      expect(await screen.findByText("Invite has expired")).toBeInTheDocument();
      expect(screen.queryByTestId("path")).not.toBeInTheDocument();
    });
  });

  describe("register then accept", () => {
    it("keeps the accept failure on screen once the user is signed in as the invitee", async () => {
      mockInviteQuery({ data: makeInviteInfo({ user_exists: false, email: "new@test.com" }) });
      mockCurrentUser(null);
      vi.mocked(api.post).mockResolvedValue({});
      vi.mocked(login).mockResolvedValue({} as never);
      const accept = mockAccept({ ok: false, error: NOT_FOUND_ERROR });

      const view = renderWithToken("good-token");
      fireEvent.change(document.querySelector('input[type="password"]')!, { target: { value: "a-long-password-12" } });
      fireEvent.click(screen.getByRole("button", { name: /Create account & join Acme Co/i }));
      await waitFor(() => expect(accept).toHaveBeenCalledTimes(1));

      // Login has made the page the invitee, which would trigger the auto-accept.
      mockCurrentUser("new@test.com");
      view.rerender(inviteRoutes("good-token"));

      expect(await screen.findByText("Invite not found or expired")).toBeInTheDocument();
      expect(screen.queryByTestId("path")).not.toBeInTheDocument();
      expect(accept).toHaveBeenCalledTimes(1);
    });
  });
});
