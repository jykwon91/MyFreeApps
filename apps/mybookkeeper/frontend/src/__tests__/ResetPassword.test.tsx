import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserRouter } from "react-router-dom";
import { AxiosError } from "axios";
import ResetPassword from "@/app/pages/ResetPassword";

vi.mock("@/shared/lib/api", () => ({
  default: { post: vi.fn() },
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
    expect(screen.getByText("At least 12 characters")).toBeInTheDocument();
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

  it("shows error when password is shorter than 12 characters", async () => {
    const user = userEvent.setup();
    const { container } = renderWithToken();
    await user.type(newPasswordInput(container), "short");
    await user.type(confirmPasswordInput(container), "short");
    await user.click(screen.getByRole("button", { name: "Reset password" }));
    await screen.findByText("Password must be at least 12 characters");
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
    await screen.findByText("Password must be at least 12 characters");
    expect(api.post).not.toHaveBeenCalled();
  });

  it("does not call the API when passwords do not match", async () => {
    const user = userEvent.setup();
    const { container } = renderWithToken();
    await user.type(newPasswordInput(container), "validpassword1");
    await user.type(confirmPasswordInput(container), "validpassword2");
    await user.click(screen.getByRole("button", { name: "Reset password" }));
    await screen.findByText("Passwords do not match");
    expect(api.post).not.toHaveBeenCalled();
  });

  it("accepts a password exactly 12 characters long", async () => {
    vi.mocked(api.post).mockResolvedValue({});
    const user = userEvent.setup();
    const { container } = renderWithToken();
    await user.type(newPasswordInput(container), "exactly12chr");
    await user.type(confirmPasswordInput(container), "exactly12chr");
    await user.click(screen.getByRole("button", { name: "Reset password" }));
    await screen.findByText("Password reset");
    expect(screen.queryByText("Password must be at least 12 characters")).not.toBeInTheDocument();
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
    await user.type(newPasswordInput(container), "newpassword1234");
    await user.type(confirmPasswordInput(container), "newpassword1234");
    await user.click(screen.getByRole("button", { name: "Reset password" }));
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/auth/reset-password", {
        token: "my-reset-token",
        password: "newpassword1234",
      });
    });
  });

  it("shows the Password reset heading after a successful call", async () => {
    vi.mocked(api.post).mockResolvedValue({});
    const user = userEvent.setup();
    const { container } = renderWithToken();
    await user.type(newPasswordInput(container), "newpassword1234");
    await user.type(confirmPasswordInput(container), "newpassword1234");
    await user.click(screen.getByRole("button", { name: "Reset password" }));
    await screen.findByText("Password reset");
    expect(screen.getByText(/updated/i)).toBeInTheDocument();
  });

  it("hides the password form after success", async () => {
    vi.mocked(api.post).mockResolvedValue({});
    const user = userEvent.setup();
    const { container } = renderWithToken();
    await user.type(newPasswordInput(container), "newpassword1234");
    await user.type(confirmPasswordInput(container), "newpassword1234");
    await user.click(screen.getByRole("button", { name: "Reset password" }));
    await screen.findByText("Password reset");
    expect(newPasswordInput(container)).not.toBeInTheDocument();
  });

  it("navigates to /login with replace when Sign in is clicked on the success screen", async () => {
    vi.mocked(api.post).mockResolvedValue({});
    const user = userEvent.setup();
    const { container } = renderWithToken();
    await user.type(newPasswordInput(container), "newpassword1234");
    await user.type(confirmPasswordInput(container), "newpassword1234");
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

  it("shows a plain message, not axios's own text, when the request never reaches the server", async () => {
    vi.mocked(api.post).mockRejectedValue(new AxiosError("Network Error", "ERR_NETWORK"));
    const user = userEvent.setup();
    const { container } = renderWithToken();
    await user.type(newPasswordInput(container), "newpassword1234");
    await user.type(confirmPasswordInput(container), "newpassword1234");
    await user.click(screen.getByRole("button", { name: "Reset password" }));
    await screen.findByText("Something went wrong. Please try again.");
  });

  it("shows the token-expired message for the server's axios RESET_PASSWORD_BAD_TOKEN", async () => {
    const axiosErr = Object.assign(new Error("Request failed with status code 400"), {
      response: { status: 400, data: { detail: "RESET_PASSWORD_BAD_TOKEN" } },
    });
    vi.mocked(api.post).mockRejectedValue(axiosErr);
    const user = userEvent.setup();
    const { container } = renderWithToken();
    await user.type(newPasswordInput(container), "newpassword1234");
    await user.type(confirmPasswordInput(container), "newpassword1234");
    await user.click(screen.getByRole("button", { name: "Reset password" }));
    await screen.findByText("This reset link has expired or already been used. Request a new one.");
  });

  it("passes a plain Error's message through", async () => {
    vi.mocked(api.post).mockRejectedValue(new Error("Server error"));
    const user = userEvent.setup();
    const { container } = renderWithToken();
    await user.type(newPasswordInput(container), "newpassword1234");
    await user.type(confirmPasswordInput(container), "newpassword1234");
    await user.click(screen.getByRole("button", { name: "Reset password" }));
    await screen.findByText("Server error");
  });

  it("does not show the success screen when the API call fails", async () => {
    vi.mocked(api.post).mockRejectedValue(new Error("Server error"));
    const user = userEvent.setup();
    const { container } = renderWithToken();
    await user.type(newPasswordInput(container), "newpassword1234");
    await user.type(confirmPasswordInput(container), "newpassword1234");
    await user.click(screen.getByRole("button", { name: "Reset password" }));
    await screen.findByText("Server error");
    expect(screen.queryByText("Password reset")).not.toBeInTheDocument();
  });

  it("does not navigate when the API call fails", async () => {
    vi.mocked(api.post).mockRejectedValue(new Error("Server error"));
    const user = userEvent.setup();
    const { container } = renderWithToken();
    await user.type(newPasswordInput(container), "newpassword1234");
    await user.type(confirmPasswordInput(container), "newpassword1234");
    await user.click(screen.getByRole("button", { name: "Reset password" }));
    await screen.findByText("Server error");
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("surfaces the breach message when the backend returns an HIBP rejection", async () => {
    const breachReason =
      "This password has appeared in a known data breach. Please pick a different one. (We checked anonymously — your password never left our server in plaintext.)";
    const axiosErr = Object.assign(new AxiosError("Request failed with status code 400", "ERR_BAD_REQUEST"), {
      response: { status: 400, data: { detail: { code: "RESET_PASSWORD_INVALID_PASSWORD", reason: breachReason } } },
    });
    vi.mocked(api.post).mockRejectedValue(axiosErr);
    const user = userEvent.setup();
    const { container } = renderWithToken();
    await user.type(newPasswordInput(container), "mypassword1234");
    await user.type(confirmPasswordInput(container), "mypassword1234");
    await user.click(screen.getByRole("button", { name: "Reset password" }));
    await screen.findByText(/known data breach/i);
    await screen.findByText(/anonymously/i);
  });
});
