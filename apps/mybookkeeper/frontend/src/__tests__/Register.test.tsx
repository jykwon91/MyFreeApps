import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserRouter } from "react-router-dom";
import Register from "@/app/pages/Register";

vi.mock("@/shared/lib/api", () => ({
  default: { post: vi.fn() },
}));

vi.mock("@/shared/lib/auth", () => ({
  login: vi.fn(),
}));

vi.mock("@/shared/utils/errorMessage", () => ({
  extractErrorMessage: (err: unknown) =>
    err instanceof Error ? err.message : "An unexpected error occurred",
}));

// TurnstileWidget renders null when VITE_TURNSTILE_SITE_KEY is not set,
// which is the case in the test environment.
vi.mock("@/shared/components/ui/TurnstileWidget", () => ({
  default: ({ onVerify }: { onVerify: (t: string) => void }) => (
    <button type="button" data-testid="turnstile" onClick={() => onVerify("test-token")}>
      Verify
    </button>
  ),
}));

import api from "@/shared/lib/api";
import { login } from "@/shared/lib/auth";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

function renderRegister(search = "") {
  window.history.pushState({}, "", "/register" + search);
  return render(<BrowserRouter><Register /></BrowserRouter>);
}

function nameInput(container: HTMLElement) {
  return container.querySelector("input[type='text']") as HTMLElement;
}

function emailInput(container: HTMLElement) {
  return container.querySelector("input[type='email']") as HTMLElement;
}

function passwordInput(container: HTMLElement) {
  return container.querySelector("input[type='password']") as HTMLElement;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe("Register \u2014 rendering", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("renders the name input", () => {
    const { container } = renderRegister();
    expect(nameInput(container)).toBeInTheDocument();
  });

  it("renders the email input", () => {
    const { container } = renderRegister();
    expect(emailInput(container)).toBeInTheDocument();
  });

  it("renders the password input", () => {
    const { container } = renderRegister();
    expect(passwordInput(container)).toBeInTheDocument();
  });

  it("renders the Sign up button", () => {
    renderRegister();
    expect(screen.getByRole("button", { name: "Sign up" })).toBeInTheDocument();
  });

  it("renders a Sign in link pointing to /login", () => {
    renderRegister();
    const link = screen.getByRole("link", { name: "Sign in" });
    expect(link).toHaveAttribute("href", "/login");
  });

  it("does not show an error initially", () => {
    renderRegister();
    expect(screen.queryByText(/password must/i)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

describe("Register \u2014 validation", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("shows error when password is shorter than 8 characters", async () => {
    const user = userEvent.setup();
    const { container } = renderRegister();
    await user.type(emailInput(container), "user@example.com");
    await user.type(passwordInput(container), "short");
    await user.click(screen.getByRole("button", { name: "Sign up" }));
    await screen.findByText("Password must be at least 8 characters");
  });

  it("does not call the API when the password is too short", async () => {
    const user = userEvent.setup();
    const { container } = renderRegister();
    await user.type(emailInput(container), "user@example.com");
    await user.type(passwordInput(container), "short");
    await user.click(screen.getByRole("button", { name: "Sign up" }));
    await screen.findByText("Password must be at least 8 characters");
    expect(api.post).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Submit \u2014 happy path
// ---------------------------------------------------------------------------

describe("Register \u2014 submit success", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("calls the register endpoint with trimmed email, password, and name", async () => {
    vi.mocked(api.post).mockResolvedValue({});
    vi.mocked(login).mockResolvedValue({ access_token: "tok123" });
    const user = userEvent.setup();
    const { container } = renderRegister();
    await user.type(nameInput(container), "Jane Doe");
    await user.type(emailInput(container), " jane@example.com ");
    await user.type(passwordInput(container), "mypassword1");
    await user.click(screen.getByRole("button", { name: "Sign up" }));
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        "/auth/register",
        { email: "jane@example.com", password: "mypassword1", name: "Jane Doe" },
        expect.any(Object)
      );
    });
  });

  it("sends null for name when the name field is left empty", async () => {
    vi.mocked(api.post).mockResolvedValue({});
    vi.mocked(login).mockResolvedValue({ access_token: "tok123" });
    const user = userEvent.setup();
    const { container } = renderRegister();
    await user.type(emailInput(container), "jane@example.com");
    await user.type(passwordInput(container), "mypassword1");
    await user.click(screen.getByRole("button", { name: "Sign up" }));
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        "/auth/register",
        { email: "jane@example.com", password: "mypassword1", name: null },
        expect.any(Object)
      );
    });
  });

  it("calls login with the trimmed email and password after registration", async () => {
    vi.mocked(api.post).mockResolvedValue({});
    vi.mocked(login).mockResolvedValue({ access_token: "tok123" });
    const user = userEvent.setup();
    const { container } = renderRegister();
    await user.type(emailInput(container), "jane@example.com");
    await user.type(passwordInput(container), "mypassword1");
    await user.click(screen.getByRole("button", { name: "Sign up" }));
    await waitFor(() => {
      expect(login).toHaveBeenCalledWith("jane@example.com", "mypassword1");
    });
  });

  it("navigates to / after successful registration when no returnTo is set", async () => {
    vi.mocked(api.post).mockResolvedValue({});
    vi.mocked(login).mockResolvedValue({ access_token: "tok123" });
    const user = userEvent.setup();
    const { container } = renderRegister();
    await user.type(emailInput(container), "jane@example.com");
    await user.type(passwordInput(container), "mypassword1");
    await user.click(screen.getByRole("button", { name: "Sign up" }));
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/", { replace: true });
    });
  });

  it("navigates to the returnTo path after successful registration", async () => {
    vi.mocked(api.post).mockResolvedValue({});
    vi.mocked(login).mockResolvedValue({ access_token: "tok123" });
    const user = userEvent.setup();
    const { container } = renderRegister("?returnTo=%2Fdashboard");
    await user.type(emailInput(container), "jane@example.com");
    await user.type(passwordInput(container), "mypassword1");
    await user.click(screen.getByRole("button", { name: "Sign up" }));
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/dashboard", { replace: true });
    });
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe("Register \u2014 error handling", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("shows an error message when registration fails", async () => {
    vi.mocked(api.post).mockRejectedValue(new Error("Email already registered"));
    const user = userEvent.setup();
    const { container } = renderRegister();
    await user.type(emailInput(container), "taken@example.com");
    await user.type(passwordInput(container), "mypassword1");
    await user.click(screen.getByRole("button", { name: "Sign up" }));
    await screen.findByText("Email already registered");
  });

  it("does not navigate when registration fails", async () => {
    vi.mocked(api.post).mockRejectedValue(new Error("Email already registered"));
    const user = userEvent.setup();
    const { container } = renderRegister();
    await user.type(emailInput(container), "taken@example.com");
    await user.type(passwordInput(container), "mypassword1");
    await user.click(screen.getByRole("button", { name: "Sign up" }));
    await screen.findByText("Email already registered");
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("does not navigate when auto-login fails after registration", async () => {
    vi.mocked(api.post).mockResolvedValue({});
    vi.mocked(login).mockRejectedValue(new Error("Login failed"));
    const user = userEvent.setup();
    const { container } = renderRegister();
    await user.type(emailInput(container), "jane@example.com");
    await user.type(passwordInput(container), "mypassword1");
    await user.click(screen.getByRole("button", { name: "Sign up" }));
    await screen.findByText("Login failed");
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("clears the error when a new submission is made", async () => {
    vi.mocked(api.post)
      .mockRejectedValueOnce(new Error("Server error"))
      .mockResolvedValueOnce({});
    vi.mocked(login).mockResolvedValue({ access_token: "tok" });
    const user = userEvent.setup();
    const { container } = renderRegister();
    await user.type(emailInput(container), "jane@example.com");
    await user.type(passwordInput(container), "mypassword1");
    await user.click(screen.getByRole("button", { name: "Sign up" }));
    await screen.findByText("Server error");
    await user.click(screen.getByRole("button", { name: "Sign up" }));
    await waitFor(() => {
      expect(screen.queryByText("Server error")).not.toBeInTheDocument();
    });
  });
});
