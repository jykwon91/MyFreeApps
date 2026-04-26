import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DeleteAccountModal from "@/app/features/security/DeleteAccountModal";

// Mock RTK Query hooks — top-level so Vitest can hoist them
const mockDeleteAccount = vi.fn();
vi.mock("@/shared/store/accountApi", () => ({
  useDeleteAccountMutation: () => [mockDeleteAccount, { isLoading: false }],
}));

// Controlled TOTP status — mutated per test that needs 2FA enabled
const mockTotpStatus = { data: { enabled: false } };
vi.mock("@/shared/store/totpApi", () => ({
  useGetTotpStatusQuery: () => mockTotpStatus,
}));

vi.mock("@/shared/lib/auth", () => ({
  logout: vi.fn(),
}));

vi.mock("@/shared/lib/toast-store", () => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

vi.mock("@/shared/utils/errorMessage", () => ({
  extractErrorMessage: (err: unknown) => String(err),
}));

function renderModal(open = true) {
  const onClose = vi.fn();
  render(<DeleteAccountModal open={open} onClose={onClose} />);
  return { onClose };
}

describe("DeleteAccountModal — structure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset TOTP status to disabled before each test
    mockTotpStatus.data.enabled = false;
  });

  it("renders the confirmation modal when open", () => {
    renderModal(true);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/delete account permanently/i)).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    renderModal(false);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders email, password inputs and Delete forever button", () => {
    renderModal();

    expect(screen.getByLabelText(/type your email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /delete forever/i })).toBeInTheDocument();
  });

  it("does not render TOTP input when 2FA is disabled", () => {
    renderModal();

    expect(screen.queryByLabelText(/two-factor/i)).not.toBeInTheDocument();
  });

  it("Delete forever button is disabled when fields are empty", () => {
    renderModal();

    const btn = screen.getByRole("button", { name: /delete forever/i });
    expect(btn).toBeDisabled();
  });
});

describe("DeleteAccountModal — TOTP field (2FA enabled)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTotpStatus.data.enabled = true;
  });

  afterEach(() => {
    mockTotpStatus.data.enabled = false;
  });

  it("shows TOTP input when 2FA is enabled", () => {
    renderModal();

    expect(screen.getByLabelText(/two-factor/i)).toBeInTheDocument();
  });
});

describe("DeleteAccountModal — form interaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTotpStatus.data.enabled = false;
  });

  it("Delete forever button becomes enabled when email and password are filled", async () => {
    const user = userEvent.setup();
    renderModal();

    await user.type(screen.getByLabelText(/type your email/i), "me@example.com");
    await user.type(screen.getByLabelText(/password/i), "mypassword");

    const btn = screen.getByRole("button", { name: /delete forever/i });
    expect(btn).not.toBeDisabled();
  });

  it("calls deleteAccount with correct payload on submit", async () => {
    const user = userEvent.setup();
    mockDeleteAccount.mockReturnValue({ unwrap: vi.fn().mockResolvedValue(undefined) });
    renderModal();

    await user.type(screen.getByLabelText(/type your email/i), "me@example.com");
    await user.type(screen.getByLabelText(/password/i), "secretpassword");
    await user.click(screen.getByRole("button", { name: /delete forever/i }));

    expect(mockDeleteAccount).toHaveBeenCalledWith({
      password: "secretpassword",
      confirm_email: "me@example.com",
      totp_code: null,
    });
  });

  it("shows error toast when deletion fails", async () => {
    const { showError } = await import("@/shared/lib/toast-store");
    const user = userEvent.setup();
    mockDeleteAccount.mockReturnValue({
      unwrap: vi.fn().mockRejectedValue("Incorrect password"),
    });
    renderModal();

    await user.type(screen.getByLabelText(/type your email/i), "me@example.com");
    await user.type(screen.getByLabelText(/password/i), "wrongpassword");
    await user.click(screen.getByRole("button", { name: /delete forever/i }));

    await vi.waitFor(() => {
      expect(showError).toHaveBeenCalled();
    });
  });
});
