/**
 * Unit tests for AuthRequired — the frontend gate for public-read / auth-write
 * apps.
 *
 * Verifies the gate behaviour:
 *   - authenticated       → renders children
 *   - unauthenticated     → renders the sign-in fallback (heading + Sign in button)
 *   - unavailable={true}  → redirects home, renders neither children nor card
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

const mockNavigate = vi.fn();

vi.mock("../lib/auth-store", () => ({
  useIsAuthenticated: vi.fn(),
  notifyAuthChange: vi.fn(),
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const mod = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...mod,
    useNavigate: () => mockNavigate,
  };
});

import { useIsAuthenticated } from "../lib/auth-store";
import AuthRequired from "../components/auth/AuthRequired";

const mockUseIsAuthenticated = vi.mocked(useIsAuthenticated);

function renderWithRouter(ui: React.ReactNode, initialPath = "/sources") {
  return render(<MemoryRouter initialEntries={[initialPath]}>{ui}</MemoryRouter>);
}

describe("AuthRequired", () => {
  it("renders children when authenticated", () => {
    mockUseIsAuthenticated.mockReturnValue(true);
    renderWithRouter(
      <AuthRequired action="manage sources">
        <div data-testid="protected">protected content</div>
      </AuthRequired>,
    );
    expect(screen.getByTestId("protected")).toBeInTheDocument();
  });

  it("when unavailable, redirects home and renders neither children nor sign-in card", () => {
    // Even with a valid auth token, unavailable must NOT render gated content —
    // it redirects to the public home (fail closed).
    mockUseIsAuthenticated.mockReturnValue(true);
    renderWithRouter(
      <AuthRequired action="manage sources" unavailable>
        <div data-testid="protected">protected content</div>
      </AuthRequired>,
    );
    expect(screen.queryByTestId("protected")).toBeNull();
    expect(screen.queryByRole("heading", { name: /sign in to/i })).toBeNull();
  });

  it("renders sign-in fallback when not authenticated", () => {
    mockUseIsAuthenticated.mockReturnValue(false);
    renderWithRouter(
      <AuthRequired action="manage sources">
        <div data-testid="protected">protected content</div>
      </AuthRequired>,
    );
    expect(screen.queryByTestId("protected")).toBeNull();
    // Heading uses the action string
    expect(screen.getByRole("heading", { name: /sign in to manage sources/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });

  it("falls back to generic heading when no action is provided", () => {
    mockUseIsAuthenticated.mockReturnValue(false);
    renderWithRouter(
      <AuthRequired>
        <div>protected</div>
      </AuthRequired>,
    );
    expect(screen.getByRole("heading", { name: /sign in to continue/i })).toBeInTheDocument();
  });

  it("navigates to /login with the current path as state.from on click", () => {
    mockUseIsAuthenticated.mockReturnValue(false);
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
    mockUseIsAuthenticated.mockReturnValue(false);
    renderWithRouter(
      <AuthRequired action="upload a lineup" description="Only the operator can add lineups.">
        <div>protected</div>
      </AuthRequired>,
    );
    expect(screen.getByText(/only the operator can add lineups/i)).toBeInTheDocument();
  });
});
