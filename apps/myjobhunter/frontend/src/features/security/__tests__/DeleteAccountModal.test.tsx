import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/auth", () => ({
  signOut: vi.fn(),
}));

vi.mock("@/lib/accountApi", () => ({
  useDeleteAccountMutation: vi.fn(),
}));

vi.mock("@/lib/userApi", () => ({
  useGetCurrentUserQuery: vi.fn(),
}));

vi.mock("@platform/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@platform/ui")>();
  return {
    ...actual,
    showError: vi.fn(),
    extractErrorMessage: vi.fn((err: unknown) =>
      err instanceof Error ? err.message : "Something went wrong",
    ),
  } as typeof import("@platform/ui");
});

import DeleteAccountModal from "@/features/security/DeleteAccountModal";
import { signOut } from "@/lib/auth";
import { useDeleteAccountMutation } from "@/lib/accountApi";
import { useGetCurrentUserQuery } from "@/lib/userApi";
import { showError } from "@platform/ui";

const mockSignOut = vi.mocked(signOut);
const mockUseDeleteAccountMutation = vi.mocked(useDeleteAccountMutation);
const mockUseGetCurrentUserQuery = vi.mocked(useGetCurrentUserQuery);
const mockShowError = vi.mocked(showError);

interface DeleteMutationFn {
  unwrap: () => Promise<void>;
}

function setupMutation(unwrapImpl: () => Promise<void>) {
  const trigger = vi.fn(() => ({ unwrap: unwrapImpl }) as DeleteMutationFn);
  // RTK Query's mutation tuple is complex; cast to the expected return type via
  // unknown to avoid using `any` while still bypassing the full generic signature
  // that the test doesn't need to exercise.
  mockUseDeleteAccountMutation.mockReturnValue(
    [trigger, { isLoading: false }] as unknown as ReturnType<typeof useDeleteAccountMutation>,
  );
  return trigger;
}

function setupCurrentUser(totp_enabled: boolean) {
  mockUseGetCurrentUserQuery.mockReturnValue({
    data: {
      id: "user-1",
      email: "user@example.com",
      display_name: "",
      totp_enabled,
      is_verified: true,
    },
    isLoading: false,
    isFetching: false,
    isSuccess: true,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useGetCurrentUserQuery>);
}

describe("DeleteAccountModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupCurrentUser(false);
    setupMutation(() => Promise.resolve());
  });

  it("renders with email + password inputs and a disabled delete button", () => {
    render(<DeleteAccountModal open onClose={() => undefined} />);
    expect(screen.getByLabelText(/Type your email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Password$/i)).toBeInTheDocument();
    const deleteButton = screen.getByRole("button", { name: /Delete forever/i });
    expect(deleteButton).toBeDisabled();
  });

  it("hides the TOTP field when 2FA is disabled", () => {
    setupCurrentUser(false);
    render(<DeleteAccountModal open onClose={() => undefined} />);
    expect(
      screen.queryByLabelText(/two-factor authentication code/i),
    ).not.toBeInTheDocument();
  });

  it("shows the TOTP field when 2FA is enabled", () => {
    setupCurrentUser(true);
    render(<DeleteAccountModal open onClose={() => undefined} />);
    expect(
      screen.getByLabelText(/two-factor authentication code/i),
    ).toBeInTheDocument();
  });

  it("enables the delete button once email and password are filled (no TOTP)", async () => {
    const user = userEvent.setup();
    render(<DeleteAccountModal open onClose={() => undefined} />);
    await user.type(screen.getByLabelText(/Type your email/i), "user@example.com");
    await user.type(screen.getByLabelText(/^Password$/i), "secret123!");
    expect(screen.getByRole("button", { name: /Delete forever/i })).toBeEnabled();
  });

  it("requires a 6+ char TOTP code before enabling delete when 2FA is on", async () => {
    setupCurrentUser(true);
    const user = userEvent.setup();
    render(<DeleteAccountModal open onClose={() => undefined} />);
    await user.type(screen.getByLabelText(/Type your email/i), "user@example.com");
    await user.type(screen.getByLabelText(/^Password$/i), "secret123!");
    expect(screen.getByRole("button", { name: /Delete forever/i })).toBeDisabled();
    await user.type(
      screen.getByLabelText(/two-factor authentication code/i),
      "12345",
    );
    expect(screen.getByRole("button", { name: /Delete forever/i })).toBeDisabled();
    await user.type(
      screen.getByLabelText(/two-factor authentication code/i),
      "6",
    );
    expect(screen.getByRole("button", { name: /Delete forever/i })).toBeEnabled();
  });

  it("calls deleteAccount and signOut on successful submission", async () => {
    const trigger = setupMutation(() => Promise.resolve());
    const user = userEvent.setup();
    render(<DeleteAccountModal open onClose={() => undefined} />);

    await user.type(screen.getByLabelText(/Type your email/i), "user@example.com");
    await user.type(screen.getByLabelText(/^Password$/i), "secret123!");
    await user.click(screen.getByRole("button", { name: /Delete forever/i }));

    await waitFor(() => {
      expect(trigger).toHaveBeenCalledWith({
        password: "secret123!",
        confirm_email: "user@example.com",
        totp_code: null,
      });
    });
    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalled();
    });
  });

  it("forwards the TOTP code when 2FA is enabled", async () => {
    setupCurrentUser(true);
    const trigger = setupMutation(() => Promise.resolve());
    const user = userEvent.setup();
    render(<DeleteAccountModal open onClose={() => undefined} />);

    await user.type(screen.getByLabelText(/Type your email/i), "user@example.com");
    await user.type(screen.getByLabelText(/^Password$/i), "secret123!");
    await user.type(
      screen.getByLabelText(/two-factor authentication code/i),
      "123456",
    );
    await user.click(screen.getByRole("button", { name: /Delete forever/i }));

    await waitFor(() => {
      expect(trigger).toHaveBeenCalledWith({
        password: "secret123!",
        confirm_email: "user@example.com",
        totp_code: "123456",
      });
    });
  });

  it("shows a toast and does NOT sign out when the API errors", async () => {
    const apiErr = { status: 403, data: { detail: "Incorrect password" } };
    setupMutation(() => Promise.reject(apiErr));
    const user = userEvent.setup();
    render(<DeleteAccountModal open onClose={() => undefined} />);

    await user.type(screen.getByLabelText(/Type your email/i), "user@example.com");
    await user.type(screen.getByLabelText(/^Password$/i), "wrong-password");
    await user.click(screen.getByRole("button", { name: /Delete forever/i }));

    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalled();
    });
    expect(mockSignOut).not.toHaveBeenCalled();
  });
});
