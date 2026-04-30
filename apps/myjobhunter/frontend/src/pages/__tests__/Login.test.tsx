import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Login from "@/pages/Login";

// Mock auth lib so tests don't hit the network
vi.mock("@/lib/auth", () => ({
  signIn: vi.fn(),
  register: vi.fn(),
  requestVerifyToken: vi.fn(),
  signOut: vi.fn(),
}));

// Mock @platform/ui auth store so we control isAuthenticated
vi.mock("@platform/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@platform/ui")>();
  return {
    ...actual,
    useIsAuthenticated: vi.fn(() => false),
    showError: vi.fn(),
    showSuccess: vi.fn(),
  };
});

import { signIn, register, requestVerifyToken } from "@/lib/auth";
import { useIsAuthenticated } from "@platform/ui";

const mockSignIn = vi.mocked(signIn);
const mockRegister = vi.mocked(register);
const mockRequestVerifyToken = vi.mocked(requestVerifyToken);
const mockUseIsAuthenticated = vi.mocked(useIsAuthenticated);

function renderLogin(initialEntries = ["/login"]) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/dashboard" element={<div>Dashboard</div>} />
      </Routes>
    </MemoryRouter>,
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
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText("Email"), "test@example.com");
    await user.type(screen.getByLabelText("Password"), "password123456");
    await user.click(screen.getByRole("button", { name: /^sign in$/i }));

    await waitFor(() => {
      expect(screen.getByText("Applications")).toBeInTheDocument();
    });
  });

  it("shows a 'check your inbox' banner after successful registration (no auto-login)", async () => {
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
    expect(
      await screen.findByTestId("registration-success-banner"),
    ).toHaveTextContent(/we sent a verification link to/i);
    expect(
      screen.getByTestId("registration-success-banner"),
    ).toHaveTextContent("new@example.com");
    // Must not auto-navigate to dashboard
    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
  });

  it("redirects to /dashboard if already authenticated", () => {
    mockUseIsAuthenticated.mockReturnValue(true);
    renderLogin();
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });

  describe("unverified login", () => {
    function unverifiedAxiosError() {
      const err = new Error("Request failed") as Error & {
        response: { data: { detail: string } };
      };
      err.response = { data: { detail: "LOGIN_USER_NOT_VERIFIED" } };
      return err;
    }

    it("shows the resend banner when login fails with LOGIN_USER_NOT_VERIFIED", async () => {
      mockSignIn.mockRejectedValueOnce(unverifiedAxiosError());
      const user = userEvent.setup();
      renderLogin();

      await user.type(screen.getByLabelText("Email"), "noverify@example.com");
      await user.type(screen.getByLabelText("Password"), "password123456");
      await user.click(screen.getByRole("button", { name: /^sign in$/i }));

      const banner = await screen.findByTestId("resend-verification-banner");
      expect(banner).toHaveTextContent(/please verify your email/i);
      expect(
        screen.getByRole("button", { name: /resend verification email/i }),
      ).toBeVisible();
    });

    it("does NOT show the resend banner on a regular bad-credentials failure", async () => {
      const err = new Error("Request failed") as Error & {
        response: { data: { detail: string } };
      };
      err.response = { data: { detail: "LOGIN_BAD_CREDENTIALS" } };
      mockSignIn.mockRejectedValueOnce(err);

      const user = userEvent.setup();
      renderLogin();

      await user.type(screen.getByLabelText("Email"), "test@example.com");
      await user.type(screen.getByLabelText("Password"), "wrongpass12345");
      await user.click(screen.getByRole("button", { name: /^sign in$/i }));

      await waitFor(() => {
        expect(mockSignIn).toHaveBeenCalled();
      });
      expect(
        screen.queryByTestId("resend-verification-banner"),
      ).not.toBeInTheDocument();
    });

    it("clicking 'Resend verification email' POSTs the email", async () => {
      mockSignIn.mockRejectedValueOnce(unverifiedAxiosError());
      mockRequestVerifyToken.mockResolvedValueOnce(undefined);
      const user = userEvent.setup();
      renderLogin();

      await user.type(screen.getByLabelText("Email"), "noverify@example.com");
      await user.type(screen.getByLabelText("Password"), "password123456");
      await user.click(screen.getByRole("button", { name: /^sign in$/i }));

      const resendBtn = await screen.findByRole("button", {
        name: /resend verification email/i,
      });
      await user.click(resendBtn);

      await waitFor(() => {
        expect(mockRequestVerifyToken).toHaveBeenCalledWith("noverify@example.com");
      });
      expect(
        await screen.findByTestId("resend-verification-sent"),
      ).toHaveTextContent(/verification email sent/i);
    });
  });
});
