/**
 * Unit tests for AuthRequired.
 *
 * Verifies the gate behaviour:
 *   - authenticated   → renders children
 *   - unauthenticated → renders the sign-in fallback (heading + Sign in button)
 *
 * Public-read / auth-write model: see apps/mygamingassistant/CLAUDE.md →
 * Authentication Model.
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

const mockIsAuthenticated = vi.fn(() => false);
const mockNavigate = vi.fn();

vi.mock("@platform/ui", () => ({
  Button: ({ children, ...props }: { children: React.ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
  useIsAuthenticated: () => mockIsAuthenticated(),
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const mod = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...mod,
    useNavigate: () => mockNavigate,
  };
});

import AuthRequired from "@/components/auth/AuthRequired";

function renderWithRouter(ui: React.ReactNode, initialPath = "/sources") {
  return render(<MemoryRouter initialEntries={[initialPath]}>{ui}</MemoryRouter>);
}

describe("AuthRequired", () => {
  it("renders children when authenticated", () => {
    mockIsAuthenticated.mockReturnValue(true);
    renderWithRouter(
      <AuthRequired action="manage sources">
        <div data-testid="protected">protected content</div>
      </AuthRequired>,
    );
    expect(screen.getByTestId("protected")).toBeDefined();
  });

  it("renders sign-in fallback when not authenticated", () => {
    mockIsAuthenticated.mockReturnValue(false);
    renderWithRouter(
      <AuthRequired action="manage sources">
        <div data-testid="protected">protected content</div>
      </AuthRequired>,
    );
    expect(screen.queryByTestId("protected")).toBeNull();
    // Heading uses the action string
    expect(screen.getByRole("heading", { name: /sign in to manage sources/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeDefined();
  });

  it("falls back to generic heading when no action is provided", () => {
    mockIsAuthenticated.mockReturnValue(false);
    renderWithRouter(
      <AuthRequired>
        <div>protected</div>
      </AuthRequired>,
    );
    expect(screen.getByRole("heading", { name: /sign in to continue/i })).toBeDefined();
  });

  it("navigates to /login with the current path as state.from on click", () => {
    mockIsAuthenticated.mockReturnValue(false);
    mockNavigate.mockClear();
    renderWithRouter(
      <AuthRequired action="manage sources">
        <div>protected</div>
      </AuthRequired>,
      "/sources?tab=channel",
    );
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    expect(mockNavigate).toHaveBeenCalledWith(
      "/login",
      expect.objectContaining({
        state: expect.objectContaining({ from: "/sources?tab=channel" }),
      }),
    );
  });

  it("renders the custom description when supplied", () => {
    mockIsAuthenticated.mockReturnValue(false);
    renderWithRouter(
      <AuthRequired action="upload a lineup" description="Only the operator can add lineups.">
        <div>protected</div>
      </AuthRequired>,
    );
    expect(screen.getByText(/only the operator can add lineups/i)).toBeDefined();
  });
});
