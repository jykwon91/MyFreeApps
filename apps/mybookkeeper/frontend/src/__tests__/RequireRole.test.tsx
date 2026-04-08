import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import RequireRole from "@/shared/components/RequireRole";

vi.mock("@/shared/hooks/useCurrentUser", () => ({
  useCurrentUser: vi.fn(),
  useHasRole: vi.fn(),
  useIsAdmin: vi.fn(),
}));

import { useCurrentUser } from "@/shared/hooks/useCurrentUser";

describe("RequireRole", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders children when user has required role", () => {
    vi.mocked(useCurrentUser).mockReturnValue({
      user: { id: "1", email: "a@b.com", role: "admin" } as ReturnType<typeof useCurrentUser>["user"],
      isLoading: false,
      isError: false,
      error: undefined,
    });

    render(
      <MemoryRouter>
        <RequireRole roles={["admin"]}>
          <div data-testid="protected">Admin Content</div>
        </RequireRole>
      </MemoryRouter>,
    );

    expect(screen.getByTestId("protected")).toBeInTheDocument();
  });

  it("redirects to /forbidden when user lacks required role", () => {
    vi.mocked(useCurrentUser).mockReturnValue({
      user: { id: "1", email: "a@b.com", role: "user" } as ReturnType<typeof useCurrentUser>["user"],
      isLoading: false,
      isError: false,
      error: undefined,
    });

    render(
      <MemoryRouter initialEntries={["/admin"]}>
        <Routes>
          <Route
            path="/admin"
            element={
              <RequireRole roles={["admin"]}>
                <div>Admin</div>
              </RequireRole>
            }
          />
          <Route path="/forbidden" element={<div data-testid="forbidden-page">Forbidden</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByTestId("forbidden-page")).toBeInTheDocument();
  });

  it("shows loading skeleton while user data is being fetched", () => {
    vi.mocked(useCurrentUser).mockReturnValue({
      user: null,
      isLoading: true,
      isError: false,
      error: undefined,
    });

    const { container } = render(
      <MemoryRouter>
        <RequireRole roles={["admin"]}>
          <div>Admin</div>
        </RequireRole>
      </MemoryRouter>,
    );

    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  // ── Regression: 401 error must redirect to /login, not /forbidden ──

  it("redirects to /login on 401 API error", () => {
    vi.mocked(useCurrentUser).mockReturnValue({
      user: null,
      isLoading: false,
      isError: true,
      error: { status: 401, data: "Unauthorized" },
    });

    render(
      <MemoryRouter initialEntries={["/admin"]}>
        <Routes>
          <Route
            path="/admin"
            element={
              <RequireRole roles={["admin"]}>
                <div>Admin</div>
              </RequireRole>
            }
          />
          <Route path="/login" element={<div data-testid="login-page">Login</div>} />
          <Route path="/forbidden" element={<div data-testid="forbidden-page">Forbidden</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByTestId("login-page")).toBeInTheDocument();
    expect(screen.queryByTestId("forbidden-page")).not.toBeInTheDocument();
  });

  it("redirects to /forbidden on non-401 API error", () => {
    vi.mocked(useCurrentUser).mockReturnValue({
      user: null,
      isLoading: false,
      isError: true,
      error: { status: 500, data: "Internal Server Error" },
    });

    render(
      <MemoryRouter initialEntries={["/admin"]}>
        <Routes>
          <Route
            path="/admin"
            element={
              <RequireRole roles={["admin"]}>
                <div>Admin</div>
              </RequireRole>
            }
          />
          <Route path="/login" element={<div data-testid="login-page">Login</div>} />
          <Route path="/forbidden" element={<div data-testid="forbidden-page">Forbidden</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByTestId("forbidden-page")).toBeInTheDocument();
    expect(screen.queryByTestId("login-page")).not.toBeInTheDocument();
  });
});
