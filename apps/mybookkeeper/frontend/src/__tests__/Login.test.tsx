import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserRouter } from "react-router-dom";
import Login from "@/app/pages/Login";

vi.mock("@/shared/lib/auth", () => ({
  login: vi.fn(),
}));

import { login } from "@/shared/lib/auth";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

function renderLogin(search = "") {
  window.history.pushState({}, "", "/login" + search);
  return render(
    <BrowserRouter>
      <Login />
    </BrowserRouter>
  );
}

// Login.tsx labels lack htmlFor, so query inputs by type via container.
function emailInput(container: HTMLElement) {
  return container.querySelector("input[type=\"email\"]") as HTMLElement;
}

function passwordInput(container: HTMLElement) {
  return container.querySelector("input[type=\"password\"]") as HTMLElement;
}

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe("Login — normal login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders email and password inputs", () => {
    const { container } = renderLogin();

    expect(emailInput(container)).toBeInTheDocument();
    expect(passwordInput(container)).toBeInTheDocument();
  });

  it("renders the Sign in button", () => {
    renderLogin();

    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  it("navigates to home after successful login", async () => {
    vi.mocked(login).mockResolvedValue({ access_token: "tok123" });
    const user = userEvent.setup();
    const { container } = renderLogin();

    await user.type(emailInput(container), "user@example.com");
    await user.type(passwordInput(container), "secret123");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/");
    });
  });

  it("passes email and password to the login function", async () => {
    vi.mocked(login).mockResolvedValue({ access_token: "tok123" });
    const user = userEvent.setup();
    const { container } = renderLogin();

    await user.type(emailInput(container), "user@example.com");
    await user.type(passwordInput(container), "secret123");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(login).toHaveBeenCalledWith("user@example.com", "secret123", undefined);
    });
  });

  it("navigates to returnTo path after successful login when provided", async () => {
    vi.mocked(login).mockResolvedValue({ access_token: "tok123" });
    const user = userEvent.setup();
    const { container } = renderLogin("?returnTo=%2Fdashboard");

    await user.type(emailInput(container), "user@example.com");
    await user.type(passwordInput(container), "secret123");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
    });
  });
});

// ---------------------------------------------------------------------------
// Error cases
// ---------------------------------------------------------------------------

describe("Login — error handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows generic error message when login fails", async () => {
    vi.mocked(login).mockRejectedValue(new Error("Unauthorized"));
    const user = userEvent.setup();
    const { container } = renderLogin();

    await user.type(emailInput(container), "wrong@example.com");
    await user.type(passwordInput(container), "wrongpass");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await screen.findByText("Invalid email or password");
  });

  it("does not show error before form submission", () => {
    renderLogin();

    expect(screen.queryByText("Invalid email or password")).not.toBeInTheDocument();
  });

  it("shows validation message when email is empty", async () => {
    const user = userEvent.setup();
    const { container } = renderLogin();

    await user.type(passwordInput(container), "somepass");
    fireEvent.submit(container.querySelector("form")!);

    await screen.findByText("Email and password are required");
  });

  it("shows validation message when password is empty", async () => {
    const user = userEvent.setup();
    const { container } = renderLogin();

    await user.type(emailInput(container), "user@example.com");
    fireEvent.submit(container.querySelector("form")!);

    await screen.findByText("Email and password are required");
  });

  it("trims whitespace from email before submitting", async () => {
    vi.mocked(login).mockResolvedValue({ access_token: "tok123" });
    const user = userEvent.setup();
    const { container } = renderLogin();

    await user.type(emailInput(container), "  user@example.com  ");
    await user.type(passwordInput(container), "secret");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(login).toHaveBeenCalledWith("user@example.com", "secret", undefined);
    });
  });
});

// ---------------------------------------------------------------------------
// TOTP challenge flow
// ---------------------------------------------------------------------------

describe("Login — TOTP challenge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function submitCredentials() {
    vi.mocked(login).mockResolvedValueOnce({ detail: "totp_required" });
    const user = userEvent.setup();
    const { container } = renderLogin();

    await user.type(emailInput(container), "user@example.com");
    await user.type(passwordInput(container), "secret123");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await screen.findByText("Authentication code");
    return user;
  }

  it("hides email and password inputs when TOTP challenge is shown", async () => {
    vi.mocked(login).mockResolvedValueOnce({ detail: "totp_required" });
    const user = userEvent.setup();
    const { container } = renderLogin();

    await user.type(emailInput(container), "user@example.com");
    await user.type(passwordInput(container), "secret123");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByText("Authentication code");

    expect(emailInput(container)).not.toBeInTheDocument();
    expect(passwordInput(container)).not.toBeInTheDocument();
  });

  it("shows Authentication code label and input", async () => {
    await submitCredentials();

    expect(screen.getByText("Authentication code")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("000000")).toBeInTheDocument();
  });

  it("shows Verify button instead of Sign in", async () => {
    await submitCredentials();

    expect(screen.getByRole("button", { name: "Verify" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sign in" })).not.toBeInTheDocument();
  });

  it("shows Back to login button during TOTP step", async () => {
    await submitCredentials();

    expect(screen.getByText("Back to login")).toBeInTheDocument();
  });

  it("submits TOTP code to login function on Verify click", async () => {
    const user = await submitCredentials();
    vi.mocked(login).mockResolvedValueOnce({ access_token: "tok123" });

    await user.type(screen.getByPlaceholderText("000000"), "654321");
    await user.click(screen.getByRole("button", { name: "Verify" }));

    await waitFor(() => {
      expect(login).toHaveBeenCalledWith("user@example.com", "secret123", "654321");
    });
  });

  it("navigates to home after valid TOTP code", async () => {
    const user = await submitCredentials();
    vi.mocked(login).mockResolvedValueOnce({ access_token: "tok123" });

    await user.type(screen.getByPlaceholderText("000000"), "654321");
    await user.click(screen.getByRole("button", { name: "Verify" }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/");
    });
  });

  it("shows error from login function when TOTP code is invalid", async () => {
    const user = await submitCredentials();
    vi.mocked(login).mockRejectedValueOnce(new Error("Invalid TOTP code"));

    await user.type(screen.getByPlaceholderText("000000"), "000000");
    await user.click(screen.getByRole("button", { name: "Verify" }));

    await screen.findByText("Invalid TOTP code");
  });

  it("does not navigate when TOTP code is invalid", async () => {
    const user = await submitCredentials();
    vi.mocked(login).mockRejectedValueOnce(new Error("Invalid TOTP code"));

    await user.type(screen.getByPlaceholderText("000000"), "000000");
    await user.click(screen.getByRole("button", { name: "Verify" }));

    await screen.findByText("Invalid TOTP code");
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("strips non-alphanumeric characters from TOTP input", async () => {
    const user = await submitCredentials();

    const input = screen.getByPlaceholderText("000000");
    await user.type(input, "12-34-56");

    expect(input).toHaveValue("123456");
  });

  it("caps TOTP input at 8 characters to support recovery codes", async () => {
    const user = await submitCredentials();

    const input = screen.getByPlaceholderText("000000");
    await user.type(input, "123456789");

    expect(input).toHaveValue("12345678");
  });
});

// ---------------------------------------------------------------------------
// Back to login button
// ---------------------------------------------------------------------------

describe("Login — Back to login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function advanceToTotpStep() {
    vi.mocked(login).mockResolvedValueOnce({ detail: "totp_required" });
    const user = userEvent.setup();
    const { container } = renderLogin();

    await user.type(emailInput(container), "user@example.com");
    await user.type(passwordInput(container), "secret123");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByText("Authentication code");
    return { user, container };
  }

  it("clicking Back to login restores email and password inputs", async () => {
    const { user, container } = await advanceToTotpStep();

    await user.click(screen.getByText("Back to login"));

    expect(emailInput(container)).toBeInTheDocument();
    expect(passwordInput(container)).toBeInTheDocument();
  });

  it("clicking Back to login restores the Sign in button", async () => {
    const { user } = await advanceToTotpStep();

    await user.click(screen.getByText("Back to login"));

    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Verify" })).not.toBeInTheDocument();
  });

  it("clicking Back to login clears any TOTP error message", async () => {
    const { user } = await advanceToTotpStep();
    vi.mocked(login).mockRejectedValueOnce(new Error("Invalid TOTP code"));

    await user.type(screen.getByPlaceholderText("000000"), "000000");
    await user.click(screen.getByRole("button", { name: "Verify" }));
    await screen.findByText("Invalid TOTP code");

    await user.click(screen.getByText("Back to login"));

    expect(screen.queryByText("Invalid TOTP code")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Sign up link
// ---------------------------------------------------------------------------

describe("Login — sign up link", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows sign up link on the initial login screen", () => {
    renderLogin();

    expect(screen.getByText("Sign up")).toBeInTheDocument();
  });

  it("sign up link points to /register", () => {
    renderLogin();

    expect(screen.getByText("Sign up").closest("a")).toHaveAttribute("href", "/register");
  });

  it("sign up link includes returnTo param when returnTo is in the URL", () => {
    renderLogin("?returnTo=%2Fdashboard");

    const link = screen.getByText("Sign up").closest("a")!;
    expect(link.getAttribute("href")).toContain("returnTo=");
  });

  it("hides sign up link during TOTP challenge", async () => {
    vi.mocked(login).mockResolvedValueOnce({ detail: "totp_required" });
    const user = userEvent.setup();
    const { container } = renderLogin();

    await user.type(emailInput(container), "user@example.com");
    await user.type(passwordInput(container), "secret123");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByText("Authentication code");

    expect(screen.queryByText("Sign up")).not.toBeInTheDocument();
  });
});