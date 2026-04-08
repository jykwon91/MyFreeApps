import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserRouter } from "react-router-dom";
import ResetPassword from "@/app/pages/ResetPassword";

vi.mock("@/shared/lib/api", () => ({
  default: { post: vi.fn() },
}));

vi.mock("@/shared/utils/errorMessage", () => ({
  extractErrorMessage: (err: unknown) =>
    err instanceof Error ? err.message : "An unexpected error occurred",
}));

import api from "@/shared/lib/api";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

function renderWithToken(token = "valid-token-abc") {
  const search = token ? `?token=${encodeURIComponent(token)}` : "";
  window.history.pushState({}, "", "/reset-password" + search);
  return render(<BrowserRouter><ResetPassword /></BrowserRouter>);
}

function renderWithoutToken() {
  window.history.pushState({}, "", "/reset-password");
  return render(<BrowserRouter><ResetPassword /></BrowserRouter>);
}

function newPasswordInput(container: HTMLElement) {
  return container.querySelector("input#new-password") as HTMLElement;
}

function confirmPasswordInput(container: HTMLElement) {
  return container.querySelector("input#confirm-password") as HTMLElement;
}

// ---------------------------------------------------------------------------
// Invalid link state (no token)
// ---------------------------------------------------------------------------

describe("ResetPassword \u2014 invalid link", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("shows Invalid link heading when no token is in the URL", () => {
    renderWithoutToken();
    expect(screen.getByText("Invalid link")).toBeInTheDocument();
  });

  it("shows explanation text about an expired link", () => {
    renderWithoutToken();
    expect(screen.getByText(/invalid or has expired/i)).toBeInTheDocument();
  });

  it("shows a Request new link anchor pointing to /forgot-password", () => {
    renderWithoutToken();
    const link = screen.getByRole("link", { name: "Request new link" });
    expect(link).toHaveAttribute("href", "/forgot-password");
  });

  it("does not render the password form when no token is present", () => {
    const { container } = renderWithoutToken();
    expect(newPasswordInput(container)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reset password" })).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Form rendering
// ---------------------------------------------------------------------------

describe("ResetPassword \u2014 form rendering", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("renders the new password input when a token is present", () => {
    const { container } = renderWithToken();
    expect(newPasswordInput(container)).toBeInTheDocument();
  });

  it("renders the confirm password input when a token is present", () => {
    const { container } = renderWithToken();
    expect(confirmPasswordInput(container)).toBeInTheDocument();
  });

  it("renders the Reset password button", () => {
    renderWithToken();
    expect(screen.getByRole("button", { name: "Reset password" })).toBeInTheDocument();
  });

  it("renders a Back to sign in link pointing to /login", () => {
    renderWithToken();
    const link = screen.getByRole("link", { name: "Back to sign in" });
    expect(link).toHaveAttribute("href", "/login");
  });

  it("shows the minimum length hint text", () => {
    renderWithToken();
    expect(screen.getByText("At least 8 characters")).toBeInTheDocument();
  });

  it("does not show any error before the form is submitted", () => {
    renderWithToken();
    expect(screen.queryByText(/password must/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/do not match/i)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

describe("ResetPassword \u2014 validation", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("shows error when password is shorter than 8 characters", async () => {
    const user = userEvent.setup();
    const { container } = renderWithToken();
    await user.type(newPasswordInput(container), "short");
    await user.type(confirmPasswordInput(container), "short");
    await user.click(screen.getByRole("button", { name: "Reset password" }));
    await screen.findByText("Password must be at least 8 characters");
  });

  it("shows error when passwords do not match", async () => {
    const user = userEvent.setup();
    const { container } = renderWithToken();
    await user.type(newPasswordInput(container), "longpassword1");
    await user.type(confirmPasswordInput(container), "longpassword2");
    await user.click(screen.getByRole("button", { name: "Reset password" }));
    await screen.findByText("Passwords do not match");
  });

  it("does not call the API when the password is too short", async () => {
    const user = userEvent.setup();
    const { container } = renderWithToken();
    await user.type(newPasswordInput(container), "abc");
    await user.type(confirmPasswordInput(container), "abc");
    await user.click(screen.getByRole("button", { name: "Reset password" }));
    await screen.findByText("Password must be at least 8 characters");
    expect(api.post).not.toHaveBeenCalled();
  });

  it("does not call the API when passwords do not match", async () => {
    const user = userEvent.setup();
    const { container } = renderWithToken();
    await user.type(newPasswordInput(container), "validpass1");
    await user.type(confirmPasswordInput(container), "validpass2");
    await user.click(screen.getByRole("button", { name: "Reset password" }));
    await screen.findByText("Passwords do not match");
    expect(api.post).not.toHaveBeenCalled();
  });

  it("accepts a password exactly 8 characters long", async () => {
    vi.mocked(api.post).mockResolvedValue({});
    const user = userEvent.setup();
    const { container } = renderWithToken();
    await user.type(newPasswordInput(container), "exactly8");
    await user.type(confirmPasswordInput(container), "exactly8");
    await user.click(screen.getByRole("button", { name: "Reset password" }));
    await screen.findByText("Password reset");
    expect(screen.queryByText("Password must be at least 8 characters")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Submit \u2014 happy path
// ---------------------------------------------------------------------------

describe("ResetPassword \u2014 submit success", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("calls the reset-password endpoint with the token and new password", async () => {
    vi.mocked(api.post).mockResolvedValue({});
    const user = userEvent.setup();
    const { container } = renderWithToken("my-reset-token");
    await user.type(newPasswordInput(container), "newpassword1");
    await user.type(confirmPasswordInput(container), "newpassword1");
    await user.click(screen.getByRole("button", { name: "Reset password" }));
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/auth/reset-password", {
        token: "my-reset-token",
        password: "newpassword1",
      });
    });
  });

  it("shows the Password reset heading after a successful call", async () => {
    vi.mocked(api.post).mockResolvedValue({});
    const user = userEvent.setup();
    const { container } = renderWithToken();
    await user.type(newPasswordInput(container), "newpassword1");
    await user.type(confirmPasswordInput(container), "newpassword1");
    await user.click(screen.getByRole("button", { name: "Reset password" }));
    await screen.findByText("Password reset");
    expect(screen.getByText(/updated/i)).toBeInTheDocument();
  });

  it("hides the password form after success", async () => {
    vi.mocked(api.post).mockResolvedValue({});
    const user = userEvent.setup();
    const { container } = renderWithToken();
    await user.type(newPasswordInput(container), "newpassword1");
    await user.type(confirmPasswordInput(container), "newpassword1");
    await user.click(screen.getByRole("button", { name: "Reset password" }));
    await screen.findByText("Password reset");
    expect(newPasswordInput(container)).not.toBeInTheDocument();
  });

  it("navigates to /login with replace when Sign in is clicked on the success screen", async () => {
    vi.mocked(api.post).mockResolvedValue({});
    const user = userEvent.setup();
    const { container } = renderWithToken();
    await user.type(newPasswordInput(container), "newpassword1");
    await user.type(confirmPasswordInput(container), "newpassword1");
    await user.click(screen.getByRole("button", { name: "Reset password" }));
    await screen.findByRole("button", { name: "Sign in" });
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(mockNavigate).toHaveBeenCalledWith("/login", { replace: true });
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe("ResetPassword \u2014 error handling", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("shows a token-expired message when the error message contains the word token", async () => {
    vi.mocked(api.post).mockRejectedValue(new Error("Invalid token provided"));
    const user = userEvent.setup();
    const { container } = renderWithToken();
    await user.type(newPasswordInput(container), "newpassword1");
    await user.type(confirmPasswordInput(container), "newpassword1");
    await user.click(screen.getByRole("button", { name: "Reset password" }));
    await screen.findByText(/expired or already been used/i);
  });

  it("shows the raw API error message for non-token errors", async () => {
    vi.mocked(api.post).mockRejectedValue(new Error("Server error"));
    const user = userEvent.setup();
    const { container } = renderWithToken();
    await user.type(newPasswordInput(container), "newpassword1");
    await user.type(confirmPasswordInput(container), "newpassword1");
    await user.click(screen.getByRole("button", { name: "Reset password" }));
    await screen.findByText("Server error");
  });

  it("does not show the success screen when the API call fails", async () => {
    vi.mocked(api.post).mockRejectedValue(new Error("Server error"));
    const user = userEvent.setup();
    const { container } = renderWithToken();
    await user.type(newPasswordInput(container), "newpassword1");
    await user.type(confirmPasswordInput(container), "newpassword1");
    await user.click(screen.getByRole("button", { name: "Reset password" }));
    await screen.findByText("Server error");
    expect(screen.queryByText("Password reset")).not.toBeInTheDocument();
  });

  it("does not navigate when the API call fails", async () => {
    vi.mocked(api.post).mockRejectedValue(new Error("Server error"));
    const user = userEvent.setup();
    const { container } = renderWithToken();
    await user.type(newPasswordInput(container), "newpassword1");
    await user.type(confirmPasswordInput(container), "newpassword1");
    await user.click(screen.getByRole("button", { name: "Reset password" }));
    await screen.findByText("Server error");
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
