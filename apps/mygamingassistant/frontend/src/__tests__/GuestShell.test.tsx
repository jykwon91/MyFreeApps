/**
 * Unit tests for GuestShell — the layout shown to unauthenticated visitors.
 *
 * Verifies:
 *   - the top-bar Sign in button is present
 *   - navigation items render
 *   - clicking Sign in routes to /login with the current location captured
 *
 * Public-read / auth-write model: see apps/mygamingassistant/CLAUDE.md →
 * Authentication Model.
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

const mockNavigate = vi.fn();

vi.mock("@platform/ui", () => ({
  Button: ({ children, ...props }: { children: React.ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
  useMediaQuery: () => false, // desktop view
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const mod = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...mod,
    useNavigate: () => mockNavigate,
  };
});

import GuestShell from "@/components/auth/GuestShell";

const SAMPLE_NAV = [
  { path: "/", label: "Games", icon: <span data-testid="icon-games" />, exact: true },
  { path: "/packages", label: "Packages", icon: <span data-testid="icon-packages" /> },
];

function renderWithRouter(ui: React.ReactNode, initialPath = "/") {
  return render(<MemoryRouter initialEntries={[initialPath]}>{ui}</MemoryRouter>);
}

describe("GuestShell", () => {
  it("renders the top-bar Sign in button", () => {
    renderWithRouter(
      <GuestShell logo={<div>logo</div>} nav={SAMPLE_NAV}>
        <div>content</div>
      </GuestShell>,
    );
    expect(screen.getByTestId("topbar-sign-in")).toBeDefined();
  });

  it("renders the supplied nav items", () => {
    renderWithRouter(
      <GuestShell logo={<div>logo</div>} nav={SAMPLE_NAV}>
        <div>content</div>
      </GuestShell>,
    );
    expect(screen.getByText("Games")).toBeDefined();
    expect(screen.getByText("Packages")).toBeDefined();
  });

  it("renders content", () => {
    renderWithRouter(
      <GuestShell logo={<div>logo</div>} nav={SAMPLE_NAV}>
        <div data-testid="content">inner</div>
      </GuestShell>,
    );
    expect(screen.getByTestId("content")).toBeDefined();
  });

  it("routes to /login with the current location captured on Sign in click", () => {
    mockNavigate.mockClear();
    renderWithRouter(
      <GuestShell logo={<div>logo</div>} nav={SAMPLE_NAV}>
        <div>content</div>
      </GuestShell>,
      "/packages?game=cs2",
    );
    fireEvent.click(screen.getByTestId("topbar-sign-in"));
    expect(mockNavigate).toHaveBeenCalledWith(
      "/login",
      expect.objectContaining({
        state: expect.objectContaining({ from: "/packages?game=cs2" }),
      }),
    );
  });

  it("renders the headerActions slot when provided", () => {
    renderWithRouter(
      <GuestShell
        logo={<div>logo</div>}
        nav={SAMPLE_NAV}
        headerActions={<button data-testid="theme-toggle">toggle</button>}
      >
        <div>content</div>
      </GuestShell>,
    );
    expect(screen.getByTestId("theme-toggle")).toBeDefined();
  });
});
