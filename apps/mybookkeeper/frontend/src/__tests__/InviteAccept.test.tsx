import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import InviteAccept from "@/app/pages/InviteAccept";

vi.mock("@/shared/store/membersApi", () => ({
  useAcceptInviteMutation: vi.fn(),
}));

vi.mock("@/shared/lib/auth", () => ({
  isAuthenticated: vi.fn(),
}));

vi.mock("@/shared/utils/errorMessage", () => ({
  extractErrorMessage: (err: unknown) =>
    err instanceof Error ? err.message : "An unexpected error occurred",
}));

import { useAcceptInviteMutation } from "@/shared/store/membersApi";
import { isAuthenticated } from "@/shared/lib/auth";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

function renderWithToken(token: string) {
  return render(
    <MemoryRouter initialEntries={[`/invite/${token}`]}>
      <Routes>
        <Route path="/invite/:token" element={<InviteAccept />} />
      </Routes>
    </MemoryRouter>
  );
}

// ---------------------------------------------------------------------------
// Unauthenticated redirect
// ---------------------------------------------------------------------------

describe("InviteAccept \u2014 unauthenticated user", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isAuthenticated).mockReturnValue(false);
    vi.mocked(useAcceptInviteMutation).mockReturnValue([
      vi.fn().mockReturnValue({ unwrap: vi.fn() }),
      {} as never,
    ]);
  });

  it("redirects to login with the invite URL as returnTo when user is not authenticated", () => {
    renderWithToken("abc-token");
    expect(mockNavigate).toHaveBeenCalledWith(
      "/login?returnTo=%2Finvite%2Fabc-token",
      { replace: true }
    );
  });

  it("does not call acceptInvite when user is not authenticated", () => {
    const accept = vi.fn().mockReturnValue({ unwrap: vi.fn() });
    vi.mocked(useAcceptInviteMutation).mockReturnValue([accept, {} as never]);
    renderWithToken("abc-token");
    expect(accept).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

describe("InviteAccept \u2014 loading state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isAuthenticated).mockReturnValue(true);
  });

  it("shows skeleton loaders while the invite is being accepted", () => {
    const unwrap = vi.fn().mockReturnValue(new Promise(() => {}));
    vi.mocked(useAcceptInviteMutation).mockReturnValue([
      vi.fn().mockReturnValue({ unwrap }),
      {} as never,
    ]);
    const { container } = renderWithToken("pending-token");
    const skeletons = container.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Success state
// ---------------------------------------------------------------------------

describe("InviteAccept \u2014 success", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isAuthenticated).mockReturnValue(true);
  });

  it("shows the success heading after the invite is accepted", async () => {
    const unwrap = vi.fn().mockResolvedValue({ organization_id: "org1", org_role: "member" });
    vi.mocked(useAcceptInviteMutation).mockReturnValue([
      vi.fn().mockReturnValue({ unwrap }),
      {} as never,
    ]);
    renderWithToken("good-token");
    await screen.findByText("You're in!");
  });

  it("shows the redirect message after the invite is accepted", async () => {
    const unwrap = vi.fn().mockResolvedValue({ organization_id: "org1", org_role: "member" });
    vi.mocked(useAcceptInviteMutation).mockReturnValue([
      vi.fn().mockReturnValue({ unwrap }),
      {} as never,
    ]);
    renderWithToken("good-token");
    await screen.findByText("Redirecting you to the dashboard...");
  });

  it("navigates to / after a 2 second delay on success", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const unwrap = vi.fn().mockResolvedValue({ organization_id: "org1", org_role: "member" });
    vi.mocked(useAcceptInviteMutation).mockReturnValue([
      vi.fn().mockReturnValue({ unwrap }),
      {} as never,
    ]);
    renderWithToken("good-token");
    await screen.findByText("You're in!");
    await act(async () => { vi.advanceTimersByTime(2000); });
    expect(mockNavigate).toHaveBeenCalledWith("/", { replace: true });
    vi.useRealTimers();
  });

  it("calls acceptInvite with the token from the URL", async () => {
    const unwrap = vi.fn().mockResolvedValue({ organization_id: "org1", org_role: "member" });
    const accept = vi.fn().mockReturnValue({ unwrap });
    vi.mocked(useAcceptInviteMutation).mockReturnValue([accept, {} as never]);
    renderWithToken("specific-token-xyz");
    await screen.findByText("You're in!");
    expect(accept).toHaveBeenCalledWith("specific-token-xyz");
  });
});

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------

describe("InviteAccept \u2014 error", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isAuthenticated).mockReturnValue(true);
  });

  it("shows the Invite failed heading when the API call fails", async () => {
    const unwrap = vi.fn().mockRejectedValue(new Error("Invalid or expired invite"));
    vi.mocked(useAcceptInviteMutation).mockReturnValue([
      vi.fn().mockReturnValue({ unwrap }),
      {} as never,
    ]);
    renderWithToken("bad-token");
    await screen.findByText("Invite failed");
  });

  it("shows the error message returned by the API", async () => {
    const unwrap = vi.fn().mockRejectedValue(new Error("Invalid or expired invite"));
    vi.mocked(useAcceptInviteMutation).mockReturnValue([
      vi.fn().mockReturnValue({ unwrap }),
      {} as never,
    ]);
    renderWithToken("bad-token");
    await screen.findByText("Invalid or expired invite");
  });

  it("shows a Go to dashboard link when the invite fails", async () => {
    const unwrap = vi.fn().mockRejectedValue(new Error("Invalid or expired invite"));
    vi.mocked(useAcceptInviteMutation).mockReturnValue([
      vi.fn().mockReturnValue({ unwrap }),
      {} as never,
    ]);
    renderWithToken("bad-token");
    await screen.findByText("Invite failed");
    const link = screen.getByRole("link", { name: "Go to dashboard" });
    expect(link).toHaveAttribute("href", "/");
  });

  it("does not navigate automatically when the API call fails", async () => {
    const unwrap = vi.fn().mockRejectedValue(new Error("Invalid or expired invite"));
    vi.mocked(useAcceptInviteMutation).mockReturnValue([
      vi.fn().mockReturnValue({ unwrap }),
      {} as never,
    ]);
    renderWithToken("bad-token");
    await screen.findByText("Invite failed");
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
