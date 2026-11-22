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

const EMAIL = "user@example.com";
const PASSWORD = "a-password-123";

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
        <Route path="*" element={<CurrentPath />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function submitCredentials(entry: Entry = {}) {
  const user = userEvent.setup();
  renderLogin(entry);
  await user.type(screen.getByLabelText("Email"), EMAIL);
  await user.type(screen.getByLabelText("Password"), PASSWORD);
  await user.click(screen.getByRole("button", { name: "Sign In" }));
  return user;
}

describe("Login page", () => {
  beforeEach(() => vi.clearAllMocks());

  it("signs in and goes home when nothing asked to come back", async () => {
    mockSignIn.mockResolvedValueOnce({ status: "ok" });
    await submitCredentials();

    expect(await screen.findByTestId("current-path")).toHaveTextContent(/^\/$/);
    expect(mockSignIn).toHaveBeenCalledWith(EMAIL, PASSWORD);
  });

  it("goes back to the page RequireAuth sent the learner from", async () => {
    mockSignIn.mockResolvedValueOnce({ status: "ok" });
    await submitCredentials({ state: { from: "/security" } });

    expect(await screen.findByTestId("current-path")).toHaveTextContent("/security");
  });

  it("goes to the returnTo that /register's sign-in link carries", async () => {
    mockSignIn.mockResolvedValueOnce({ status: "ok" });
    await submitCredentials({ search: `?returnTo=${encodeURIComponent("/practice?scenario=cafe")}` });

    expect(await screen.findByTestId("current-path")).toHaveTextContent("/practice?scenario=cafe");
  });

  it("prefers the page it was sent from over returnTo", async () => {
    mockSignIn.mockResolvedValueOnce({ status: "ok" });
    await submitCredentials({ search: "?returnTo=%2Fsettings", state: { from: "/security" } });

    expect(await screen.findByTestId("current-path")).toHaveTextContent("/security");
  });

  it("ignores a returnTo that leaves the app and goes home", async () => {
    mockSignIn.mockResolvedValueOnce({ status: "ok" });
    await submitCredentials({ search: `?returnTo=${encodeURIComponent("//evil.example")}` });

    expect(await screen.findByTestId("current-path")).toHaveTextContent(/^\/$/);
  });

  it("says the email or password is wrong on LOGIN_BAD_CREDENTIALS", async () => {
    mockSignIn.mockRejectedValueOnce(axiosError(400, "LOGIN_BAD_CREDENTIALS"));
    await submitCredentials();

    expect(await screen.findByText("Incorrect email or password. Please try again.")).toHaveAttribute(
      "role",
      "alert",
    );
    expect(screen.queryByTestId("resend-verification-banner")).not.toBeInTheDocument();
    expect(screen.queryByTestId("current-path")).not.toBeInTheDocument();
  });

  it("says to wait when sign-in is rate limited, not that the password is wrong", async () => {
    mockSignIn.mockRejectedValueOnce(axiosError(429, "Too many attempts"));
    await submitCredentials();

    expect(
      await screen.findByText("Too many attempts. Wait a few minutes and try again."),
    ).toBeInTheDocument();
  });

  it("offers to resend the email on LOGIN_USER_NOT_VERIFIED and sends it to that address", async () => {
    mockSignIn.mockRejectedValueOnce(axiosError(400, "LOGIN_USER_NOT_VERIFIED"));
    mockRequestVerifyToken.mockResolvedValueOnce(undefined);
    const user = await submitCredentials();

    expect(await screen.findByText(/please verify your email before signing in/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /resend verification email/i }));

    expect(mockRequestVerifyToken).toHaveBeenCalledWith(EMAIL);
    expect(await screen.findByTestId("resend-verification-sent")).not.toBeEmptyDOMElement();
  });

  it("asks a 2FA account for its code, sends it with the same credentials, then goes back", async () => {
    mockSignIn.mockResolvedValueOnce({ status: "totp_required" });
    mockSignIn.mockResolvedValueOnce({ status: "ok" });
    const user = await submitCredentials({ state: { from: "/settings" } });

    const verify = await screen.findByRole("button", { name: "Verify" });
    expect(verify).toBeDisabled();
    await user.type(screen.getByLabelText("Authentication code"), "123456");
    await user.click(verify);

    expect(mockSignIn).toHaveBeenLastCalledWith(EMAIL, PASSWORD, "123456");
    expect(await screen.findByTestId("current-path")).toHaveTextContent("/settings");
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

  it("goes back from the code step to the sign-in form", async () => {
    mockSignIn.mockResolvedValueOnce({ status: "totp_required" });
    const user = await submitCredentials();

    await user.click(await screen.findByRole("button", { name: "Back to login" }));
    expect(screen.getByRole("button", { name: "Sign In" })).toBeInTheDocument();
  });

  it("has no sign-up tab: Create account links to /register", async () => {
    const user = userEvent.setup();
    renderLogin();

    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: "Create account" }));
    expect(await screen.findByTestId("current-path")).toHaveTextContent(/^\/register$/);
  });

  it("carries the page it was sent from to /register as returnTo", async () => {
    const user = userEvent.setup();
    renderLogin({ state: { from: "/security" } });

    await user.click(screen.getByRole("link", { name: "Create account" }));
    expect(await screen.findByTestId("current-path")).toHaveTextContent("/register?returnTo=%2Fsecurity");
  });

  it("carries its own returnTo on to /register", async () => {
    const user = userEvent.setup();
    renderLogin({ search: "?returnTo=%2Fsettings" });
    expect(screen.getByRole("link", { name: "Create account" })).toHaveAttribute(
      "href",
      "/register?returnTo=%2Fsettings",
    );

    await user.click(screen.getByRole("link", { name: "Create account" }));
    expect(await screen.findByTestId("current-path")).toHaveTextContent("/register?returnTo=%2Fsettings");
  });

  it("drops an off-site returnTo from the /register link", () => {
    renderLogin({ search: `?returnTo=${encodeURIComponent("//evil.example")}` });
    expect(screen.getByRole("link", { name: "Create account" })).toHaveAttribute("href", "/register");
  });

  it("puts the cursor in the email field", () => {
    renderLogin();
    expect(screen.getByLabelText("Email")).toHaveFocus();
  });

  it("opens Forgot password inside the app", async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.click(screen.getByRole("link", { name: "Forgot password?" }));
    expect(await screen.findByTestId("current-path")).toHaveTextContent("/forgot-password");
  });
});
