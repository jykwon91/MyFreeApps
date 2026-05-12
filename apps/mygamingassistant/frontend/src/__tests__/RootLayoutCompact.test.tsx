/**
 * Unit tests for RootLayout compact mode.
 *
 * When ?compact=1 is in the URL, the AppShell should NOT render.
 * When compact is absent, AppShell renders.
 *
 * We mock platform/ui and react-router-dom to avoid needing a full
 * data-router context (ScrollRestoration requires one).
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

// Minimal stubs for platform/ui components used in RootLayout
vi.mock("@platform/ui", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-shell">{children}</div>
  ),
  RequireAuth: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="require-auth">{children}</div>
  ),
  StepUpModal: () => <div data-testid="step-up-modal" />,
  Toaster: () => <div data-testid="toaster" />,
  useIsAuthenticated: () => false,
}));

vi.mock("@/constants/nav", () => ({
  buildNav: () => [],
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

// Import after mocks
import { useSearchParams } from "react-router-dom";
import RootLayout from "@/RootLayout";

describe("RootLayout compact mode", () => {
  it("renders AppShell when compact param is absent", () => {
    const params = new URLSearchParams();
    vi.mocked(useSearchParams).mockReturnValue([params, vi.fn()]);

    render(<RootLayout />);
    expect(screen.getByTestId("app-shell")).toBeDefined();
  });

  it("hides AppShell when ?compact=1", () => {
    const params = new URLSearchParams("compact=1");
    vi.mocked(useSearchParams).mockReturnValue([params, vi.fn()]);

    render(<RootLayout />);
    expect(screen.queryByTestId("app-shell")).toBeNull();
  });
});
