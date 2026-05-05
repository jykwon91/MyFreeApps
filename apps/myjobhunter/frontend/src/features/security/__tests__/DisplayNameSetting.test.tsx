import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/userApi", () => ({
  useGetCurrentUserQuery: vi.fn(),
  useUpdateCurrentUserMutation: vi.fn(),
}));

vi.mock("@platform/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@platform/ui")>();
  return {
    ...actual,
    showSuccess: vi.fn(),
    showError: vi.fn(),
  } as typeof import("@platform/ui");
});

import DisplayNameSetting from "@/features/security/DisplayNameSetting";
import { useGetCurrentUserQuery, useUpdateCurrentUserMutation } from "@/lib/userApi";
import { showSuccess, showError } from "@platform/ui";

const mockUseGetCurrentUserQuery = vi.mocked(useGetCurrentUserQuery);
const mockUseUpdateCurrentUserMutation = vi.mocked(useUpdateCurrentUserMutation);
const mockShowSuccess = vi.mocked(showSuccess);
const mockShowError = vi.mocked(showError);

interface UpdateMutationFn {
  unwrap: () => Promise<unknown>;
}

function setupQuery(displayName: string, isLoading = false) {
  mockUseGetCurrentUserQuery.mockReturnValue({
    data: isLoading
      ? undefined
      : {
          id: "user-1",
          email: "user@example.com",
          display_name: displayName,
          totp_enabled: false,
          is_verified: true,
        },
    isLoading,
    isFetching: false,
    isSuccess: !isLoading,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useGetCurrentUserQuery>);
}

function setupMutation(unwrapImpl: () => Promise<unknown> = () => Promise.resolve({})) {
  const trigger = vi.fn(() => ({ unwrap: unwrapImpl }) as UpdateMutationFn);
  mockUseUpdateCurrentUserMutation.mockReturnValue(
    [trigger, { isLoading: false }] as unknown as ReturnType<
      typeof useUpdateCurrentUserMutation
    >,
  );
  return trigger;
}

describe("DisplayNameSetting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupQuery("Jane Smith");
    setupMutation();
  });

  it("renders the display name input and Save button", () => {
    render(<DisplayNameSetting />);
    expect(screen.getByRole("textbox")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Save/i })).toBeInTheDocument();
  });

  it("pre-fills the input with the current display name", () => {
    render(<DisplayNameSetting />);
    expect(screen.getByRole("textbox")).toHaveValue("Jane Smith");
  });

  it("disables the Save button when the value hasn't changed", () => {
    render(<DisplayNameSetting />);
    expect(screen.getByRole("button", { name: /Save/i })).toBeDisabled();
  });

  it("enables the Save button once the name is changed", async () => {
    const user = userEvent.setup();
    render(<DisplayNameSetting />);
    await user.clear(screen.getByRole("textbox"));
    await user.type(screen.getByRole("textbox"), "John Doe");
    expect(screen.getByRole("button", { name: /Save/i })).toBeEnabled();
  });

  it("calls updateCurrentUser with the trimmed name and shows success toast", async () => {
    const trigger = setupMutation(() => Promise.resolve({ display_name: "John Doe" }));
    const user = userEvent.setup();
    render(<DisplayNameSetting />);

    await user.clear(screen.getByRole("textbox"));
    await user.type(screen.getByRole("textbox"), "John Doe");
    await user.click(screen.getByRole("button", { name: /Save/i }));

    await waitFor(() => {
      expect(trigger).toHaveBeenCalledWith({ display_name: "John Doe" });
    });
    await waitFor(() => {
      expect(mockShowSuccess).toHaveBeenCalledWith("Display name saved.");
    });
  });

  it("sends null when the name is cleared (empty string)", async () => {
    const trigger = setupMutation(() => Promise.resolve({ display_name: "" }));
    const user = userEvent.setup();
    render(<DisplayNameSetting />);

    await user.clear(screen.getByRole("textbox"));
    await user.click(screen.getByRole("button", { name: /Save/i }));

    await waitFor(() => {
      expect(trigger).toHaveBeenCalledWith({ display_name: null });
    });
  });

  it("shows an error toast and does NOT update originalName when the API fails", async () => {
    setupMutation(() => Promise.reject(new Error("network error")));
    const user = userEvent.setup();
    render(<DisplayNameSetting />);

    await user.clear(screen.getByRole("textbox"));
    await user.type(screen.getByRole("textbox"), "New Name");
    await user.click(screen.getByRole("button", { name: /Save/i }));

    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalled();
    });
    expect(mockShowSuccess).not.toHaveBeenCalled();
    // The Save button should still be enabled because the save failed
    expect(screen.getByRole("button", { name: /Save/i })).toBeEnabled();
  });

  it("disables the input while the user data is loading", () => {
    setupQuery("", true);
    setupMutation();
    render(<DisplayNameSetting />);
    expect(screen.getByRole("textbox")).toBeDisabled();
  });
});
