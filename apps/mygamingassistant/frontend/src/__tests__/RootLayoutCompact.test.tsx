/**
 * Unit tests for RootLayout rendering branches.
 *
 * RootLayout has three branches:
 *   - ?compact=1                 → no shell (Outlet directly)
 *   - authenticated              → AppShell (full sidebar + user dropdown)
 *   - unauthenticated (default)  → GuestShell (public nav + Sign in CTA)
 *
 * We mock platform/ui and react-router-dom to avoid needing a full
 * data-router context (ScrollRestoration requires one).
 *
 * Public-read / auth-write model: see apps/mygamingassistant/CLAUDE.md →
 * Authentication Model.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Mock ScrollRestoration (requires data router context we don't have in unit tests)
vi.mock("react-router-dom", async (importOriginal) => {
  const mod = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...mod,
    ScrollRestoration: () => null,
    Outlet: () => <div data-testid="outlet" />,
    // useSearchParams driven by a mock so we can simulate ?compact=1
    useSearchParams: vi.fn(),
  };
});

const mockIsAuthenticated = vi.fn(() => false);

// Minimal stubs for platform/ui components used in RootLayout. GuestShell now
// lives in @platform/ui (extracted from the local copy), so it's stubbed here
// alongside AppShell — we just want to assert which shell renders, not exercise
// its internals (those have their own tests in shared-frontend).
vi.mock("@platform/ui", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-shell">{children}</div>
  ),
  GuestShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="guest-shell">{children}</div>
  ),
  StepUpModal: () => <div data-testid="step-up-modal" />,
  ThemeToggle: () => <div data-testid="theme-toggle" />,
  Toaster: () => <div data-testid="toaster" />,
  useIsAuthenticated: () => mockIsAuthenticated(),
}));

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
import { useSearchParams } from "react-router-dom";
import RootLayout from "@/RootLayout";

describe("RootLayout branches", () => {
  it("renders GuestShell when unauthenticated and compact is absent", () => {
    mockIsAuthenticated.mockReturnValue(false);
    const params = new URLSearchParams();
    vi.mocked(useSearchParams).mockReturnValue([params, vi.fn()]);

    render(<RootLayout />);
    expect(screen.getByTestId("guest-shell")).toBeDefined();
    expect(screen.queryByTestId("app-shell")).toBeNull();
  });

  it("renders AppShell when authenticated and compact is absent", () => {
    mockIsAuthenticated.mockReturnValue(true);
    const params = new URLSearchParams();
    vi.mocked(useSearchParams).mockReturnValue([params, vi.fn()]);

    render(<RootLayout />);
    expect(screen.getByTestId("app-shell")).toBeDefined();
    expect(screen.queryByTestId("guest-shell")).toBeNull();
  });

  it("hides both shells when ?compact=1 (authenticated)", () => {
    mockIsAuthenticated.mockReturnValue(true);
    const params = new URLSearchParams("compact=1");
    vi.mocked(useSearchParams).mockReturnValue([params, vi.fn()]);

    render(<RootLayout />);
    expect(screen.queryByTestId("app-shell")).toBeNull();
    expect(screen.queryByTestId("guest-shell")).toBeNull();
    // Outlet should render directly
    expect(screen.getByTestId("outlet")).toBeDefined();
  });

  it("hides both shells when ?compact=1 (unauthenticated)", () => {
    // Compact mode strips the shell regardless of auth state — inner routes
    // do their own gating via <AuthRequired>.
    mockIsAuthenticated.mockReturnValue(false);
    const params = new URLSearchParams("compact=1");
    vi.mocked(useSearchParams).mockReturnValue([params, vi.fn()]);

    render(<RootLayout />);
    expect(screen.queryByTestId("app-shell")).toBeNull();
    expect(screen.queryByTestId("guest-shell")).toBeNull();
    expect(screen.getByTestId("outlet")).toBeDefined();
  });
});
