import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Login from "@/pages/Login";

vi.mock("@/lib/auth", () => ({
  signIn: vi.fn(),
  requestVerifyToken: vi.fn(),
}));

vi.mock("@platform/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@platform/ui")>();
  return { ...actual, useIsAuthenticated: vi.fn(() => false) };
});

import { signIn } from "@/lib/auth";

const mockSignIn = vi.mocked(signIn);

/** axios rejection: body at err.response.data, .message is the status line. */
function axiosError(status: number, detail: string): Error {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    response: { status, data: { detail } },
  });
}

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={["/login"]}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<div>Home</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function submitCredentials() {
  const user = userEvent.setup();
  renderLogin();
  await user.type(screen.getByLabelText("Email"), "user@example.com");
  await user.type(screen.getByLabelText("Password"), "a-password-123");
  await user.click(screen.getByRole("button", { name: /^sign in$/i }));
  return user;
}

describe("Login page errors", () => {
  beforeEach(() => vi.clearAllMocks());

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
});
