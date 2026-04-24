import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import RequireAuth from "../components/auth/RequireAuth";

// We mock the auth-store to control authentication state
vi.mock("../lib/auth-store", () => ({
  useIsAuthenticated: vi.fn(),
  notifyAuthChange: vi.fn(),
}));

import { useIsAuthenticated } from "../lib/auth-store";

const mockUseIsAuthenticated = vi.mocked(useIsAuthenticated);

describe("RequireAuth", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders children when authenticated", () => {
    mockUseIsAuthenticated.mockReturnValue(true);

    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Routes>
          <Route
            path="/dashboard"
            element={
              <RequireAuth>
                <div>Protected Content</div>
              </RequireAuth>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("Protected Content")).toBeInTheDocument();
  });

  it("redirects to /login when not authenticated", () => {
    mockUseIsAuthenticated.mockReturnValue(false);

    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Routes>
          <Route
            path="/dashboard"
            element={
              <RequireAuth>
                <div>Protected Content</div>
              </RequireAuth>
            }
          />
          <Route path="/login" element={<div>Login Page</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("Login Page")).toBeInTheDocument();
    expect(screen.queryByText("Protected Content")).toBeNull();
  });

  it("redirects to a custom path when redirectTo is provided", () => {
    mockUseIsAuthenticated.mockReturnValue(false);

    render(
      <MemoryRouter initialEntries={["/secret"]}>
        <Routes>
          <Route
            path="/secret"
            element={
              <RequireAuth redirectTo="/auth/sign-in">
                <div>Secret</div>
              </RequireAuth>
            }
          />
          <Route path="/auth/sign-in" element={<div>Sign In</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("Sign In")).toBeInTheDocument();
  });
});
