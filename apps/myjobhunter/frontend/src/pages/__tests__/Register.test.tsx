/**
 * Tests for the invite-only Register page.
 *
 * Page is a multi-state component:
 *   no token        → redirect to /login
 *   loading invite  → "Checking your invite…" placeholder
 *   invite invalid  → "Invite unavailable" rejection card
 *   invite expired  → "expired" rejection card with login link
 *   invite accepted → "already used" rejection card
 *   pending invite  → form with email pre-bound + PasswordPair + Turnstile
 *   submitted ok    → "Check your inbox" success card with sessionStorage write
 *   submit error    → form-level error in red below the inputs
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import Register from "@/pages/Register";
import { useGetInviteInfoQuery } from "@/store/invitesApi";

// ---------------------------------------------------------------------------
// Mocks — keep tests pure (no network, no Turnstile widget render).
// ---------------------------------------------------------------------------

vi.mock("@/lib/auth", () => ({
  register: vi.fn(),
}));

vi.mock("@/store/invitesApi", () => ({
  useGetInviteInfoQuery: vi.fn(),
}));

vi.mock("@platform/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@platform/ui")>();
  return {
    ...actual,
    // Keep PasswordPair real — testing the page should exercise its
    // composition. LoadingButton + extractErrorMessage stay real too.
    TurnstileWidget: ({
      onVerify,
    }: {
      onVerify?: (token: string) => void;
      onExpire?: () => void;
    }) => (
      <button
        type="button"
        data-testid="turnstile-stub"
        onClick={() => onVerify?.("ts-token-stub")}
      >
        Turnstile stub
      </button>
    ),
  };
});

import { register } from "@/lib/auth";

const mockRegister = vi.mocked(register);
const mockUseGetInviteInfoQuery = vi.mocked(useGetInviteInfoQuery);

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/register" element={<Register />} />
        <Route path="/login" element={<div>Login page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function setInviteQueryReturn(
  partial: Partial<ReturnType<typeof useGetInviteInfoQuery>> = {},
) {
  // Fill the rest with sensible defaults so each test only specifies
  // what it cares about. The shape matches RTK Query's hook output.
  mockUseGetInviteInfoQuery.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    error: undefined,
    refetch: vi.fn(),
    ...partial,
  } as unknown as ReturnType<typeof useGetInviteInfoQuery>);
}

// ---------------------------------------------------------------------------

describe("Register page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setInviteQueryReturn();
    sessionStorage.clear();
  });

  it("redirects to /login when no invite token in the URL", () => {
    renderAt("/register");
    expect(screen.getByText("Login page")).toBeInTheDocument();
  });

  it("shows loading placeholder while invite info is fetching", () => {
    setInviteQueryReturn({ isLoading: true });
    renderAt("/register?invite=tok");
    expect(screen.getByText(/checking your invite/i)).toBeInTheDocument();
  });

  it("shows the invalid-link rejection card when invite-info errors", () => {
    setInviteQueryReturn({
      isError: true,
      error: { data: { detail: "Invite not found." } },
    });
    renderAt("/register?invite=bogus");
    expect(screen.getByText(/invite unavailable/i)).toBeInTheDocument();
    expect(screen.getByText("Invite not found.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /go to sign in/i })).toBeInTheDocument();
  });

  it("shows expired rejection card when invite status is expired", () => {
    setInviteQueryReturn({
      data: {
        email: "x@example.com",
        status: "expired",
        expires_at: "2025-01-01T00:00:00Z",
      },
    });
    renderAt("/register?invite=tok");
    expect(screen.getByText(/invite has expired/i)).toBeInTheDocument();
  });

  it("shows already-used rejection card when invite status is accepted", () => {
    setInviteQueryReturn({
      data: {
        email: "x@example.com",
        status: "accepted",
        expires_at: "2030-01-01T00:00:00Z",
      },
    });
    renderAt("/register?invite=tok");
    expect(screen.getByText(/already been used/i)).toBeInTheDocument();
  });

  it("renders the registration form with email pre-bound (read-only) for a pending invite", () => {
    setInviteQueryReturn({
      data: {
        email: "candidate@example.com",
        status: "pending",
        expires_at: "2030-01-01T00:00:00Z",
      },
    });
    renderAt("/register?invite=tok");

    const emailField = screen.getByDisplayValue("candidate@example.com") as HTMLInputElement;
    expect(emailField.readOnly).toBe(true);
    expect(emailField.type).toBe("email");

    // PasswordPair renders two password-type inputs; assert both exist by
    // counting them rather than label-matching (PasswordPair's labels
    // aren't htmlFor-associated yet).
    const passwordInputs = document.querySelectorAll('input[type="password"]');
    expect(passwordInputs.length).toBe(2);
    expect(screen.getByTestId("turnstile-stub")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign up/i })).toBeInTheDocument();
  });

  it("disables submit until terms are accepted AND passwords match + meet minLength", () => {
    setInviteQueryReturn({
      data: {
        email: "candidate@example.com",
        status: "pending",
        expires_at: "2030-01-01T00:00:00Z",
      },
    });
    renderAt("/register?invite=tok");

    const submit = screen.getByRole("button", { name: /sign up/i });
    const pwInputs = document.querySelectorAll(
      'input[type="password"]',
    ) as NodeListOf<HTMLInputElement>;
    const [pw, conf] = [pwInputs[0]!, pwInputs[1]!];
    expect((submit as HTMLButtonElement).disabled).toBe(true);

    // Password too short → disabled even with terms checked
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.change(pw, { target: { value: "short" } });
    fireEvent.change(conf, { target: { value: "short" } });
    expect((submit as HTMLButtonElement).disabled).toBe(true);

    // Long enough but mismatched → disabled
    fireEvent.change(pw, { target: { value: "longenough12chars" } });
    fireEvent.change(conf, { target: { value: "different-password" } });
    expect((submit as HTMLButtonElement).disabled).toBe(true);

    // Match + length OK → enabled
    fireEvent.change(conf, { target: { value: "longenough12chars" } });
    expect((submit as HTMLButtonElement).disabled).toBe(false);
  });

  it("shows 'check your inbox' on successful submit and persists invite token in sessionStorage", async () => {
    mockRegister.mockResolvedValueOnce(undefined);
    setInviteQueryReturn({
      data: {
        email: "candidate@example.com",
        status: "pending",
        expires_at: "2030-01-01T00:00:00Z",
      },
    });
    renderAt("/register?invite=tok-abc-123");

    fireEvent.click(screen.getByRole("checkbox"));
    {
      const inputs = document.querySelectorAll('input[type="password"]');
      fireEvent.change(inputs[0]!, { target: { value: "longenough12chars" } });
      fireEvent.change(inputs[1]!, { target: { value: "longenough12chars" } });
    }
    fireEvent.click(screen.getByTestId("turnstile-stub"));

    fireEvent.submit(
      screen
        .getByRole("button", { name: /sign up/i })
        .closest("form") as HTMLFormElement,
    );

    await waitFor(() => {
      expect(screen.getByText(/check your inbox/i)).toBeInTheDocument();
    });
    expect(mockRegister).toHaveBeenCalledWith(
      "candidate@example.com",
      "longenough12chars",
      "ts-token-stub",
    );
    expect(sessionStorage.getItem("myjobhunter.pendingInviteToken")).toBe(
      "tok-abc-123",
    );
  });

  it("surfaces a form-level error when register() rejects", async () => {
    mockRegister.mockRejectedValueOnce(
      new Error("Password leaked in HIBP breach data"),
    );
    setInviteQueryReturn({
      data: {
        email: "candidate@example.com",
        status: "pending",
        expires_at: "2030-01-01T00:00:00Z",
      },
    });
    renderAt("/register?invite=tok");

    fireEvent.click(screen.getByRole("checkbox"));
    {
      const inputs = document.querySelectorAll('input[type="password"]');
      fireEvent.change(inputs[0]!, { target: { value: "longenough12chars" } });
      fireEvent.change(inputs[1]!, { target: { value: "longenough12chars" } });
    }

    fireEvent.submit(
      screen
        .getByRole("button", { name: /sign up/i })
        .closest("form") as HTMLFormElement,
    );

    await waitFor(() => {
      expect(screen.getByText(/hibp breach/i)).toBeInTheDocument();
    });
    // The submitted-state success card must NOT have rendered.
    expect(screen.queryByText(/check your inbox/i)).not.toBeInTheDocument();
    // sessionStorage write only happens AFTER success.
    expect(sessionStorage.getItem("myjobhunter.pendingInviteToken")).toBeNull();
  });
});
