/**
 * Unit tests for GuestShell — the layout shown to unauthenticated visitors of
 * a public-read / auth-write app.
 *
 * Verifies:
 *   - the top-bar Sign in button is present
 *   - navigation items render
 *   - clicking Sign in routes to /login with the current location captured
 *   - hideSignIn suppresses the Sign in CTAs
 *   - each nav section is headed (not labelled, so it can't clash with a form field); on the collapsed rail its heading becomes a divider
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

const mockNavigate = vi.fn();

// GuestShell reads useMediaQuery to switch between desktop sidebar and mobile
// bottom nav. jsdom has no matchMedia, so mock the hook to desktop (false).
vi.mock("../hooks/useMediaQuery", () => ({
  useMediaQuery: () => false,
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const mod = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...mod,
    useNavigate: () => mockNavigate,
  };
});

import GuestShell from "../components/layout/GuestShell";

const SAMPLE_NAV = [
  { path: "/", label: "Recipes", icon: <span data-testid="icon-recipes" />, exact: true },
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
    expect(screen.getByTestId("topbar-sign-in")).toBeInTheDocument();
  });

  it("renders the supplied nav items", () => {
    renderWithRouter(
      <GuestShell logo={<div>logo</div>} nav={SAMPLE_NAV}>
        <div>content</div>
      </GuestShell>,
    );
    expect(screen.getByText("Recipes")).toBeInTheDocument();
    expect(screen.getByText("Packages")).toBeInTheDocument();
  });

  it("renders content", () => {
    renderWithRouter(
      <GuestShell logo={<div>logo</div>} nav={SAMPLE_NAV}>
        <div data-testid="content">inner</div>
      </GuestShell>,
    );
    expect(screen.getByTestId("content")).toBeInTheDocument();
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
    expect(screen.getByTestId("theme-toggle")).toBeInTheDocument();
  });

  it("hides the Sign in CTAs when hideSignIn is set", () => {
    renderWithRouter(
      <GuestShell logo={<div>logo</div>} nav={SAMPLE_NAV} hideSignIn>
        <div>content</div>
      </GuestShell>,
    );
    expect(screen.queryByTestId("topbar-sign-in")).toBeNull();
  });

  it("shows no dot unless a nav item sets dotLabel", () => {
    renderWithRouter(
      <GuestShell logo={<div>logo</div>} nav={SAMPLE_NAV}>
        <div>content</div>
      </GuestShell>,
    );
    expect(screen.queryByTestId("nav-item-dot")).toBeNull();
  });

  it("marks a section item with a dot and reads its dotLabel", () => {
    renderWithRouter(
      <GuestShell
        logo={<div>logo</div>}
        nav={SAMPLE_NAV}
        navSections={[
          {
            id: "extra",
            title: "Extra",
            items: [{ path: "/news", label: "News", icon: <span />, dotLabel: "new" }],
          },
        ]}
      >
        <div>content</div>
      </GuestShell>,
    );
    expect(screen.getAllByTestId("nav-item-dot")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "News (new)" })).toBeInTheDocument();
  });

  it("heads each section, never labels it, and swaps its heading for a divider on the collapsed rail", () => {
    renderWithRouter(
      <GuestShell
        logo={<div>logo</div>}
        nav={SAMPLE_NAV}
        collapsible
        navSections={[
          { id: "one", title: "World", items: [{ path: "/quests", label: "Quests", icon: <span /> }] },
          { id: "two", title: "Gear", items: [{ path: "/gear", label: "Best gear", icon: <span /> }] },
        ]}
      >
        <div>content</div>
      </GuestShell>,
    );
    expect(screen.getByRole("heading", { name: "Gear" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Gear")).toBeNull();
    expect(screen.getByText("World")).toBeInTheDocument();
    expect(screen.queryByTestId("nav-section-divider")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    expect(screen.queryByText("World")).toBeNull();
    expect(screen.getAllByTestId("nav-section-divider")).toHaveLength(2);
  });
});
