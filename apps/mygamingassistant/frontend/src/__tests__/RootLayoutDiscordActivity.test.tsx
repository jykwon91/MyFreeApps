/**
 * RootLayout inside the Discord Activity: the slim Activity bar (Games / theme
 * / Open in browser) replaces the website's shells, whatever the sign-in state
 * or ?compact=1 says. The shells are stubbed as in RootLayoutCompact.test.tsx;
 * inside/outside-Discord detection is real (launch parameters in the URL).
 */
import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetDiscordLaunchForTests } from "@platform/ui/discord-activity/launchParams";

vi.mock("react-router-dom", async (importOriginal) => {
  const mod = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...mod,
    // ScrollRestoration needs a data router; nothing here depends on it.
    ScrollRestoration: () => null,
    Outlet: () => <div data-testid="outlet" />,
  };
});

const auth = vi.hoisted(() => ({ isAuthenticated: false }));

vi.mock("@platform/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@platform/ui")>();
  return {
    ...actual,
    AppShell: ({ children }: { children: ReactNode }) => <div data-testid="app-shell">{children}</div>,
    GuestShell: ({ children }: { children: ReactNode }) => <div data-testid="guest-shell">{children}</div>,
    StepUpModal: () => null,
    ThemeToggle: () => <div data-testid="theme-toggle" />,
    Toaster: () => null,
    useIsAuthenticated: () => auth.isAuthenticated,
  };
});

vi.mock("@/constants/nav", () => ({
  buildNav: () => [],
  PUBLIC_NAV_PATHS: new Set(["/", "/packages", "/live/cs2"]),
}));

vi.mock("@/hooks/useIsSuperuser", () => ({
  useIsSuperuser: () => ({ isSuperuser: false }),
}));

vi.mock("@/lib/userApi", () => ({
  useGetCurrentUserQuery: () => ({ data: undefined }),
}));

vi.mock("@/lib/auth", () => ({
  signOut: vi.fn(),
}));

vi.mock("@/lib/tauri", () => ({
  isTauri: () => false,
}));

// Import after mocks
import RootLayout from "@/RootLayout";

const LAUNCH_QUERY = "?frame_id=frame-1&instance_id=instance-1&platform=desktop";

/** A fresh page load at `url`, rendered through RootLayout. */
function renderAt(url: string): void {
  window.history.replaceState(null, "", url);
  __resetDiscordLaunchForTests();
  render(
    <MemoryRouter initialEntries={[url]}>
      <RootLayout />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  auth.isAuthenticated = false;
  sessionStorage.clear();
});

afterEach(() => {
  sessionStorage.clear();
  window.history.replaceState(null, "", "/");
  __resetDiscordLaunchForTests();
});

describe("RootLayout inside the Discord Activity", () => {
  it("shows the Activity bar instead of the website's shell", () => {
    renderAt(`/${LAUNCH_QUERY}`);
    expect(screen.getByRole("link", { name: "Games" })).toHaveAttribute("href", "/");
    expect(screen.getByTestId("theme-toggle")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open in browser" })).toBeInTheDocument();
    expect(screen.getByTestId("outlet")).toBeInTheDocument();
    expect(screen.queryByTestId("guest-shell")).not.toBeInTheDocument();
  });

  it("ignores a sign-in left in storage: no account shell", () => {
    auth.isAuthenticated = true;
    renderAt(`/${LAUNCH_QUERY}`);
    expect(screen.queryByTestId("app-shell")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Games" })).toBeInTheDocument();
  });

  it("keeps the way back to the games under ?compact=1", () => {
    renderAt(`/cs2/mirage?compact=1&${LAUNCH_QUERY.slice(1)}`);
    expect(screen.getByRole("link", { name: "Games" })).toBeInTheDocument();
  });
});

describe("RootLayout on the website", () => {
  it("is unchanged: guest shell, no Activity bar", () => {
    renderAt("/");
    expect(screen.getByTestId("guest-shell")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open in browser" })).not.toBeInTheDocument();
  });
});
