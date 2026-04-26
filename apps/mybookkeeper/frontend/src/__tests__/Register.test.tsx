import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserRouter } from "react-router-dom";
import Register from "@/app/pages/Register";

vi.mock("@/shared/lib/api", () => ({
  default: { post: vi.fn() },
}));

vi.mock("@/shared/utils/errorMessage", () => ({
  extractErrorMessage: (err: unknown) => {
    if (err instanceof Error) return err.message;
    if (typeof err === "object" && err !== null) {
      const obj = err as Record<string, unknown>;
      if (typeof obj.data === "object" && obj.data !== null) {
        const data = obj.data as Record<string, unknown>;
        if (typeof data.detail === "string") return data.detail;
        if (typeof data.detail === "object" && data.detail !== null) {
          const detail = data.detail as Record<string, unknown>;
          if (typeof detail.reason === "string") return detail.reason;
        }
      }
    }
    return "An unexpected error occurred";
  },
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

function termsCheckbox() {
  return screen.getByTestId("terms-checkbox") as HTMLInputElement;
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

  it("shows error when password is shorter than 12 characters", async () => {
    const user = userEvent.setup();
    const { container } = renderRegister();
    await user.type(emailInput(container), "user@example.com");
    await user.type(passwordInput(container), "short");
    await user.click(termsCheckbox());
    await user.click(screen.getByRole("button", { name: "Sign up" }));
    await screen.findByText("Password must be at least 12 characters");
  });

  it("does not call the API when the password is too short", async () => {
    const user = userEvent.setup();
    const { container } = renderRegister();
    await user.type(emailInput(container), "user@example.com");
    await user.type(passwordInput(container), "short");
    await user.click(termsCheckbox());
    await user.click(screen.getByRole("button", { name: "Sign up" }));
    await screen.findByText("Password must be at least 12 characters");
    expect(api.post).not.toHaveBeenCalled();
  });

  it("surfaces the breach message when the backend returns an HIBP rejection", async () => {
    const breachReason =
      "This password has appeared in a known data breach. Please pick a different one. (We checked anonymously — your password never left our server in plaintext.)";
    vi.mocked(api.post).mockRejectedValue({
      data: { detail: { code: "REGISTER_INVALID_PASSWORD", reason: breachReason } },
    });
    const user = userEvent.setup();
    const { container } = renderRegister();
    await user.type(emailInput(container), "user@example.com");
    await user.type(passwordInput(container), "mypassword1234234");
    await user.click(termsCheckbox());
    await user.click(screen.getByRole("button", { name: "Sign up" }));
    await screen.findByText(/known data breach/i);
    await screen.findByText(/anonymously/i);
  });
});

// ---------------------------------------------------------------------------
// Submit \u2014 happy path
// ---------------------------------------------------------------------------

describe("Register \u2014 submit success", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("calls the register endpoint with trimmed email, password, and name", async () => {
    vi.mocked(api.post).mockResolvedValue({});
    const user = userEvent.setup();
    const { container } = renderRegister();
    await user.type(nameInput(container), "Jane Doe");
    await user.type(emailInput(container), " jane@example.com ");
    await user.type(passwordInput(container), "mypassword1234");
    await user.click(termsCheckbox());
    await user.click(screen.getByRole("button", { name: "Sign up" }));
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        "/auth/register",
        { email: "jane@example.com", password: "mypassword1234", name: "Jane Doe" },
        expect.any(Object)
      );
    });
  });

  it("sends null for name when the name field is left empty", async () => {
    vi.mocked(api.post).mockResolvedValue({});
    const user = userEvent.setup();
    const { container } = renderRegister();
    await user.type(emailInput(container), "jane@example.com");
    await user.type(passwordInput(container), "mypassword1234");
    await user.click(termsCheckbox());
    await user.click(screen.getByRole("button", { name: "Sign up" }));
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        "/auth/register",
        { email: "jane@example.com", password: "mypassword1234", name: null },
        expect.any(Object)
      );
    });
  });

  it("shows check-your-inbox message after successful registration", async () => {
    vi.mocked(api.post).mockResolvedValue({});
    const user = userEvent.setup();
    const { container } = renderRegister();
    await user.type(emailInput(container), "jane@example.com");
    await user.type(passwordInput(container), "mypassword1234");
    await user.click(termsCheckbox());
    await user.click(screen.getByRole("button", { name: "Sign up" }));
    await screen.findByText(/check your inbox/i);
  });

  it("shows the registered email in the check-inbox message", async () => {
    vi.mocked(api.post).mockResolvedValue({});
    const user = userEvent.setup();
    const { container } = renderRegister();
    await user.type(emailInput(container), "jane@example.com");
    await user.type(passwordInput(container), "mypassword1234");
    await user.click(termsCheckbox());
    await user.click(screen.getByRole("button", { name: "Sign up" }));
    await screen.findByText(/jane@example\.com/i);
  });

  it("does not navigate after successful registration", async () => {
    vi.mocked(api.post).mockResolvedValue({});
    const user = userEvent.setup();
    const { container } = renderRegister();
    await user.type(emailInput(container), "jane@example.com");
    await user.type(passwordInput(container), "mypassword1234");
    await user.click(termsCheckbox());
    await user.click(screen.getByRole("button", { name: "Sign up" }));
    await screen.findByText(/check your inbox/i);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("shows a sign in link on the check-inbox screen", async () => {
    vi.mocked(api.post).mockResolvedValue({});
    const user = userEvent.setup();
    const { container } = renderRegister();
    await user.type(emailInput(container), "jane@example.com");
    await user.type(passwordInput(container), "mypassword1234");
    await user.click(termsCheckbox());
    await user.click(screen.getByRole("button", { name: "Sign up" }));
    await screen.findByText(/check your inbox/i);
    const link = screen.getByRole("link", { name: /sign in/i });
    expect(link).toHaveAttribute("href", "/login");
  });

  it("sign in link on check-inbox screen preserves returnTo", async () => {
    vi.mocked(api.post).mockResolvedValue({});
    const user = userEvent.setup();
    const { container } = renderRegister("?returnTo=%2Fdashboard");
    await user.type(emailInput(container), "jane@example.com");
    await user.type(passwordInput(container), "mypassword1234");
    await user.click(termsCheckbox());
    await user.click(screen.getByRole("button", { name: "Sign up" }));
    await screen.findByText(/check your inbox/i);
    const link = screen.getByRole("link", { name: /sign in/i });
    expect(link.getAttribute("href")).toContain("returnTo=");
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
    await user.type(passwordInput(container), "mypassword1234");
    await user.click(termsCheckbox());
    await user.click(screen.getByRole("button", { name: "Sign up" }));
    await screen.findByText("Email already registered");
  });

  it("does not navigate when registration fails", async () => {
    vi.mocked(api.post).mockRejectedValue(new Error("Email already registered"));
    const user = userEvent.setup();
    const { container } = renderRegister();
    await user.type(emailInput(container), "taken@example.com");
    await user.type(passwordInput(container), "mypassword1234");
    await user.click(termsCheckbox());
    await user.click(screen.getByRole("button", { name: "Sign up" }));
    await screen.findByText("Email already registered");
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("clears the error when a new submission is made", async () => {
    vi.mocked(api.post)
      .mockRejectedValueOnce(new Error("Server error"))
      .mockResolvedValueOnce({});
    const user = userEvent.setup();
    const { container } = renderRegister();
    await user.type(emailInput(container), "jane@example.com");
    await user.type(passwordInput(container), "mypassword1234");
    await user.click(termsCheckbox());
    await user.click(screen.getByRole("button", { name: "Sign up" }));
    await screen.findByText("Server error");
    await user.click(screen.getByRole("button", { name: "Sign up" }));
    await waitFor(() => {
      expect(screen.queryByText("Server error")).not.toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Terms checkbox
// ---------------------------------------------------------------------------

describe("Register — terms acceptance", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("Sign up button is disabled when the terms checkbox is unchecked", () => {
    renderRegister();
    expect(screen.getByRole("button", { name: "Sign up" })).toBeDisabled();
  });

  it("Sign up button is enabled after the terms checkbox is checked", async () => {
    const user = userEvent.setup();
    renderRegister();
    await user.click(termsCheckbox());
    expect(screen.getByRole("button", { name: "Sign up" })).not.toBeDisabled();
  });

  it("unchecking the checkbox disables the button again", async () => {
    const user = userEvent.setup();
    renderRegister();
    await user.click(termsCheckbox());
    await user.click(termsCheckbox());
    expect(screen.getByRole("button", { name: "Sign up" })).toBeDisabled();
  });

  it("renders a link to /terms inside the checkbox label", () => {
    renderRegister();
    const links = screen.getAllByRole("link");
    const termsLink = links.find((l) => l.getAttribute("href") === "/terms");
    expect(termsLink).toBeDefined();
  });

  it("renders a link to /privacy inside the checkbox label", () => {
    renderRegister();
    const links = screen.getAllByRole("link");
    const privacyLink = links.find((l) => l.getAttribute("href") === "/privacy");
    expect(privacyLink).toBeDefined();
  });
});
