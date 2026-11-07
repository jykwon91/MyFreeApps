/**
 * Unit tests for AppShell — the authenticated app layout.
 *
 * Covers:
 *   - navSections: section renders only when routePrefix matches
 *   - navSections: items within an active section are rendered
 *   - navSections: section hidden when route does not match prefix
 *   - collapsible: collapse toggle sets aria-expanded correctly
 *   - collapsible: collapsed state hides label text and shows only icon
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

const mockNavigate = vi.fn();

// AppShell reads useMediaQuery to switch between desktop sidebar and mobile
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

// Mock safeStorage so we control collapse state without touching localStorage.
vi.mock("../lib/safeStorage", () => ({
  readLocalStorage: vi.fn(() => null),
  writeLocalStorage: vi.fn(),
}));

import AppShell from "../components/layout/AppShell";
import type { NavSection } from "../components/layout/AppShell";

const SAMPLE_NAV = [
  { path: "/", label: "Games", icon: <span data-testid="icon-games" />, exact: true },
];

const WOW_SECTION: NavSection = {
  id: "wow-forever",
  title: "WoW Forever",
  routePrefix: "/wow-forever",
  items: [
    { path: "/wow-forever", label: "Overview", icon: <span data-testid="icon-overview" />, exact: true },
    { path: "/wow-forever/map", label: "World Map", icon: <span data-testid="icon-map" /> },
    { path: "/wow-forever/macros", label: "Macros", icon: <span data-testid="icon-macros" /> },
  ],
};

const SAMPLE_USER = { name: "Test User", email: "test@example.com" };

function renderShell(initialPath = "/", navSections?: NavSection[], collapsible = false) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AppShell
        logo={<div>logo</div>}
        nav={SAMPLE_NAV}
        navSections={navSections}
        collapsible={collapsible}
        user={SAMPLE_USER}
        onSignOut={vi.fn()}
      >
        <div data-testid="content">content</div>
      </AppShell>
    </MemoryRouter>,
  );
}

describe("AppShell — navSections", () => {
  it("renders a section's items when route matches the prefix", () => {
    renderShell("/wow-forever/macros", [WOW_SECTION]);
    expect(screen.getByText("WoW Forever")).toBeInTheDocument();
    expect(screen.getByText("Overview")).toBeInTheDocument();
    expect(screen.getByText("World Map")).toBeInTheDocument();
    expect(screen.getByText("Macros")).toBeInTheDocument();
  });

  it("hides the section when the route does not match its prefix", () => {
    renderShell("/", [WOW_SECTION]);
    expect(screen.queryByText("WoW Forever")).toBeNull();
    expect(screen.queryByText("World Map")).toBeNull();
  });

  it("shows the section with no routePrefix on every route", () => {
    const always: NavSection = { id: "always", title: "Always On", items: WOW_SECTION.items };
    renderShell("/", [always]);
    expect(screen.getByText("Always On")).toBeInTheDocument();
  });

  it("renders main nav items alongside section items", () => {
    renderShell("/wow-forever", [WOW_SECTION]);
    expect(screen.getByText("Games")).toBeInTheDocument();
    expect(screen.getByText("WoW Forever")).toBeInTheDocument();
  });
});

describe("AppShell — collapsible", () => {
  it("renders the collapse toggle when collapsible is true", () => {
    renderShell("/", undefined, true);
    expect(screen.getByRole("button", { name: /collapse sidebar/i })).toBeInTheDocument();
  });

  it("does not render the collapse toggle when collapsible is false", () => {
    renderShell("/");
    expect(screen.queryByRole("button", { name: /collapse sidebar/i })).toBeNull();
  });

  it("toggle aria-expanded starts as true (expanded) when storage returns null", () => {
    renderShell("/", undefined, true);
    const toggle = screen.getByRole("button", { name: /collapse sidebar/i });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it("clicking the toggle changes aria-expanded", () => {
    renderShell("/", undefined, true);
    const toggle = screen.getByRole("button", { name: /collapse sidebar/i });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(toggle);
    // After collapsing, button label becomes "Expand sidebar"
    expect(screen.getByRole("button", { name: /expand sidebar/i })).toHaveAttribute("aria-expanded", "false");
  });

  it("hides nav label text when collapsed", () => {
    renderShell("/", undefined, true);
    const toggle = screen.getByRole("button", { name: /collapse sidebar/i });
    // Before collapse: label "Games" is visible
    expect(screen.getByText("Games")).toBeInTheDocument();
    fireEvent.click(toggle);
    // After collapse: "Games" text is gone (icon only)
    expect(screen.queryByText("Games")).toBeNull();
  });
});
