import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
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

function renderLogin(initialEntry: string | { pathname: string; state: unknown } = "/login") {
  const router = createMemoryRouter(
    [
      { path: "/login", element: <Login /> },
      { path: "/dashboard", element: <div>Dashboard</div> },
      { path: "/applications", element: <div>Applications</div> },
    ],
    { initialEntries: [initialEntry] },
  );
  return render(<RouterProvider router={router} />);
}

describe("Login page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseIsAuthenticated.mockReturnValue(false);
  });

  it("renders the login form", () => {
    renderLogin();
    expect(screen.getByRole("tab", { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByText(/no recruiter access/i)).toBeInTheDocument();
  });

  it("shows app branding", () => {
    renderLogin();
    expect(screen.getByText("MyJobHunter")).toBeInTheDocument();
    expect(screen.getByText(/© 2026 MyJobHunter/i)).toBeInTheDocument();
  });

  it("navigates to /dashboard on successful sign-in", async () => {
    mockSignIn.mockResolvedValue({ status: "ok" });
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText("Email"), "test@example.com");
    await user.type(screen.getByLabelText("Password"), "password123456");
    await user.click(screen.getByRole("button", { name: /^sign in$/i }));

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith(
        "test@example.com",
        "password123456",
        undefined,
      );
    });
    await waitFor(() => {
      expect(screen.getByText("Dashboard")).toBeInTheDocument();
    });
  });

  it("navigates to location.state.from after successful sign-in", async () => {
    mockSignIn.mockResolvedValue({ status: "ok" });
    const user = userEvent.setup();
    renderLogin({ pathname: "/login", state: { from: "/applications" } });

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

  it("shows the TOTP challenge when sign-in returns totp_required", async () => {
    mockSignIn.mockResolvedValue({ status: "totp_required" });
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText("Email"), "totp@example.com");
    await user.type(screen.getByLabelText("Password"), "password123456");
    await user.click(screen.getByRole("button", { name: /^sign in$/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/authentication code/i)).toBeInTheDocument();
    });
    expect(
      screen.getByText(/Enter the 6-digit code from your authenticator app/i),
    ).toBeInTheDocument();
  });

  it("re-submits with the typed totp_code on the second step", async () => {
    mockSignIn
      .mockResolvedValueOnce({ status: "totp_required" })
      .mockResolvedValueOnce({ status: "ok" });
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText("Email"), "totp@example.com");
    await user.type(screen.getByLabelText("Password"), "password123456");
    await user.click(screen.getByRole("button", { name: /^sign in$/i }));

    await screen.findByLabelText(/authentication code/i);
    await user.type(screen.getByLabelText(/authentication code/i), "123456");
    await user.click(screen.getByRole("button", { name: /^verify$/i }));

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenLastCalledWith(
        "totp@example.com",
        "password123456",
        "123456",
      );
    });
    await waitFor(() => {
      expect(screen.getByText("Dashboard")).toBeInTheDocument();
    });
  });

  it("Back to login from totp challenge restores the email/password form", async () => {
    mockSignIn.mockResolvedValue({ status: "totp_required" });
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText("Email"), "totp@example.com");
    await user.type(screen.getByLabelText("Password"), "password123456");
    await user.click(screen.getByRole("button", { name: /^sign in$/i }));

    await screen.findByLabelText(/authentication code/i);
    await user.click(screen.getByRole("button", { name: /back to login/i }));

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /sign in/i })).toBeInTheDocument();
    });
  });
});
