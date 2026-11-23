import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import Login from "@/pages/Login";

vi.mock("@/lib/auth", () => ({
  signIn: vi.fn(),
  requestVerifyToken: vi.fn(),
}));

vi.mock("@platform/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@platform/ui")>();
  return { ...actual, useIsAuthenticated: vi.fn(() => false) };
});

import { requestVerifyToken, signIn } from "@/lib/auth";

const mockSignIn = vi.mocked(signIn);
const mockRequestVerifyToken = vi.mocked(requestVerifyToken);

/** axios rejection: body at err.response.data, .message is the status line. */
function axiosError(status: number, detail: string): Error {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    response: { status, data: { detail } },
  });
}

function CurrentPath() {
  const location = useLocation();
  return <div data-testid="current-path">{location.pathname + location.search}</div>;
}

interface Entry {
  search?: string;
  state?: { from: string };
}

function renderLogin({ search = "", state }: Entry = {}) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: "/login", search, state }]}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<div>Home</div>} />
        <Route path="*" element={<CurrentPath />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function submitCredentials(entry: Entry = {}) {
  const user = userEvent.setup();
  renderLogin(entry);
  await user.type(screen.getByLabelText("Email"), "user@example.com");
  await user.type(screen.getByLabelText("Password"), "a-password-123");
  await user.click(screen.getByRole("button", { name: /^sign in$/i }));
  return user;
}

describe("Login page errors", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends the verification email again from the resend offer", async () => {
    mockSignIn.mockRejectedValueOnce(axiosError(400, "LOGIN_USER_NOT_VERIFIED"));
    mockRequestVerifyToken.mockResolvedValueOnce(undefined as never);
    const user = await submitCredentials();

    await user.click(await screen.findByRole("button", { name: /resend verification email/i }));

    expect(mockRequestVerifyToken).toHaveBeenCalledWith("user@example.com");
  });

  it("links to the forgot-password page", () => {
    renderLogin();

    expect(screen.getByRole("link", { name: "Forgot password?" })).toHaveAttribute("href", "/forgot-password");
  });

  it("has no Create account link, since the app has no sign-up", () => {
    renderLogin();

    expect(screen.queryByRole("link", { name: "Create account" })).not.toBeInTheDocument();
  });

  it("says the email or password is wrong on LOGIN_BAD_CREDENTIALS", async () => {
    mockSignIn.mockRejectedValueOnce(axiosError(400, "LOGIN_BAD_CREDENTIALS"));
    await submitCredentials();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Incorrect email or password. Please try again.",
    );
    expect(screen.queryByText(/resend verification email/i)).not.toBeInTheDocument();
  });

  it("says to wait when sign-in is rate limited, not that the password is wrong", async () => {
    mockSignIn.mockRejectedValueOnce(axiosError(429, "Too many attempts"));
    await submitCredentials();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Too many attempts. Wait a few minutes and try again.",
    );
  });

  it("offers to resend the email on LOGIN_USER_NOT_VERIFIED", async () => {
    mockSignIn.mockRejectedValueOnce(axiosError(400, "LOGIN_USER_NOT_VERIFIED"));
    await submitCredentials();

    expect(await screen.findByText(/please verify your email before signing in/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /resend verification email/i })).toBeVisible();
  });

  it("says the authentication code is invalid on invalid_totp", async () => {
    mockSignIn.mockResolvedValueOnce({ status: "totp_required" });
    mockSignIn.mockRejectedValueOnce(axiosError(401, "invalid_totp"));
    const user = await submitCredentials();

    await user.type(await screen.findByLabelText("Authentication code"), "000000");
    await user.click(screen.getByRole("button", { name: "Verify" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Invalid authentication code. Please try again.",
    );
  });

  it("shows the shared 2FA step on totp_required, signs in with the code, and lands on home", async () => {
    mockSignIn.mockResolvedValueOnce({ status: "totp_required" });
    mockSignIn.mockResolvedValueOnce({ status: "ok" });
    const user = await submitCredentials();

    await user.type(await screen.findByLabelText("Authentication code"), "123456");
    await user.click(screen.getByRole("button", { name: "Verify" }));

    expect(await screen.findByText("Home")).toBeInTheDocument();
    expect(mockSignIn).toHaveBeenLastCalledWith("user@example.com", "a-password-123", "123456");
  });

  it("says the code didn't go through when the server still asks for one", async () => {
    mockSignIn.mockResolvedValueOnce({ status: "totp_required" });
    mockSignIn.mockResolvedValueOnce({ status: "totp_required" });
    const user = await submitCredentials();

    await user.type(await screen.findByLabelText("Authentication code"), "123456");
    await user.click(screen.getByRole("button", { name: "Verify" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Authentication code didn't go through. Please try again.",
    );
  });

  it("goes back to the sign-in form from the 2FA step", async () => {
    mockSignIn.mockResolvedValueOnce({ status: "totp_required" });
    const user = await submitCredentials();

    await user.click(await screen.findByRole("button", { name: "Back to login" }));

    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Authentication code")).not.toBeInTheDocument();
  });
});

describe("Login destination", () => {
  beforeEach(() => vi.clearAllMocks());

  it("goes home when nothing asked to come back", async () => {
    mockSignIn.mockResolvedValueOnce({ status: "ok" });
    await submitCredentials();

    expect(await screen.findByText("Home")).toBeInTheDocument();
  });

  it("keeps a safe in-app path from the page RequireAuth sent them from", async () => {
    mockSignIn.mockResolvedValueOnce({ status: "ok" });
    await submitCredentials({ state: { from: "/recipes/42?tab=notes" } });

    expect(await screen.findByTestId("current-path")).toHaveTextContent("/recipes/42?tab=notes");
  });

  it("honours the returnTo query parameter", async () => {
    mockSignIn.mockResolvedValueOnce({ status: "ok" });
    await submitCredentials({ search: `?returnTo=${encodeURIComponent("/recipes/42?tab=notes")}` });

    expect(await screen.findByTestId("current-path")).toHaveTextContent("/recipes/42?tab=notes");
  });

  it("prefers the page it was sent from over returnTo", async () => {
    mockSignIn.mockResolvedValueOnce({ status: "ok" });
    await submitCredentials({ search: "?returnTo=%2Fsettings", state: { from: "/recipes/42" } });

    expect(await screen.findByTestId("current-path")).toHaveTextContent("/recipes/42");
  });

  it.each(["https://evil.example/steal", "//evil.example"])(
    "goes home instead of %s when it is the router state",
    async (bad) => {
      mockSignIn.mockResolvedValueOnce({ status: "ok" });
      await submitCredentials({ state: { from: bad } });

      expect(await screen.findByText("Home")).toBeInTheDocument();
    },
  );

  it.each(["https://evil.example/steal", "//evil.example"])(
    "goes home instead of %s when it is the returnTo",
    async (bad) => {
      mockSignIn.mockResolvedValueOnce({ status: "ok" });
      await submitCredentials({ search: `?returnTo=${encodeURIComponent(bad)}` });

      expect(await screen.findByText("Home")).toBeInTheDocument();
    },
  );
});
