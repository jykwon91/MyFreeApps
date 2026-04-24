import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Login from "@/pages/Login";

// Mock auth lib so tests don't hit the network
vi.mock("@/lib/auth", () => ({
  signIn: vi.fn(),
  register: vi.fn(),
  signOut: vi.fn(),
}));

// Mock @platform/ui auth store so we control isAuthenticated
vi.mock("@platform/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@platform/ui")>();
  return {
    ...actual,
    useIsAuthenticated: vi.fn(() => false),
  };
});

import { signIn, register } from "@/lib/auth";
import { useIsAuthenticated } from "@platform/ui";

const mockSignIn = vi.mocked(signIn);
const mockRegister = vi.mocked(register);
const mockUseIsAuthenticated = vi.mocked(useIsAuthenticated);

function renderLogin(initialEntries = ["/login"]) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/dashboard" element={<div>Dashboard</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("Login page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseIsAuthenticated.mockReturnValue(false);
  });

  it("renders the login form", () => {
    renderLogin();
    expect(screen.getByRole("tab", { name: /sign in/i })).toBeInTheDocument();
    // Use 'for' attribute match for the email label
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    // Use 'for' attribute match for password label (not the show/hide button)
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(
      screen.getByText(/no recruiter access/i)
    ).toBeInTheDocument();
  });

  it("shows app branding", () => {
    renderLogin();
    expect(screen.getByText("MyJobHunter")).toBeInTheDocument();
    expect(screen.getByText(/© 2026 MyJobHunter/i)).toBeInTheDocument();
  });

  it("navigates to /dashboard on successful sign-in", async () => {
    mockSignIn.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText("Email"), "test@example.com");
    await user.type(screen.getByLabelText("Password"), "password123456");
    await user.click(screen.getByRole("button", { name: /^sign in$/i }));

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith("test@example.com", "password123456");
    });
    await waitFor(() => {
      expect(screen.getByText("Dashboard")).toBeInTheDocument();
    });
  });

  it("navigates to location.state.from after successful sign-in", async () => {
    mockSignIn.mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(
      <MemoryRouter
        initialEntries={[{ pathname: "/login", state: { from: "/applications" } }]}
      >
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/applications" element={<div>Applications</div>} />
        </Routes>
      </MemoryRouter>
    );

    await user.type(screen.getByLabelText("Email"), "test@example.com");
    await user.type(screen.getByLabelText("Password"), "password123456");
    await user.click(screen.getByRole("button", { name: /^sign in$/i }));

    await waitFor(() => {
      expect(screen.getByText("Applications")).toBeInTheDocument();
    });
  });

  it("navigates to /dashboard on successful registration", async () => {
    mockRegister.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderLogin();

    await user.click(screen.getByRole("tab", { name: /create account/i }));
    // After tab switch, new form fields are rendered — re-query
    await user.type(screen.getByLabelText("Email"), "new@example.com");
    await user.type(screen.getByLabelText("Password"), "supersecret123");
    await user.click(screen.getByRole("button", { name: /^create account$/i }));

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith("new@example.com", "supersecret123");
    });
    await waitFor(() => {
      expect(screen.getByText("Dashboard")).toBeInTheDocument();
    });
  });

  it("redirects to /dashboard if already authenticated", () => {
    mockUseIsAuthenticated.mockReturnValue(true);
    renderLogin();
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });
});
