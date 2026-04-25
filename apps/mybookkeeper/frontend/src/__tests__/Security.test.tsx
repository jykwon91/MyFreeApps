import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Security from "@/app/pages/Security";

const STORAGE_KEY = "security-info-dismissed";

// TwoFactorSetup makes a network call on mount — mock it to prevent test noise.
vi.mock("@/app/features/security/TwoFactorSetup", () => ({
  default: () => <div data-testid="two-factor-setup">TwoFactorSetup</div>,
}));

// DeleteAccountModal is tested separately — stub it to avoid RTK Query setup.
vi.mock("@/app/features/security/DeleteAccountModal", () => ({
  default: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
    open ? (
      <div data-testid="delete-account-modal">
        <button onClick={onClose}>Close modal</button>
      </div>
    ) : null,
}));

// Mock the export API call.
vi.mock("@/shared/lib/api", () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: "{}" }),
  },
}));

vi.mock("@/shared/lib/toast-store", () => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

function renderSecurity() {
  return render(<Security />);
}

describe("Security — page structure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.removeItem(STORAGE_KEY);
  });

  afterEach(() => {
    localStorage.removeItem(STORAGE_KEY);
  });

  it("renders the Security heading", () => {
    renderSecurity();

    expect(screen.getByRole("heading", { name: "Security" })).toBeInTheDocument();
  });

  it("renders the TwoFactorSetup component", () => {
    renderSecurity();

    expect(screen.getByTestId("two-factor-setup")).toBeInTheDocument();
  });

  it("renders the Data & Privacy section heading", () => {
    renderSecurity();

    expect(screen.getByRole("heading", { name: /data.*privacy/i })).toBeInTheDocument();
  });

  it("renders the Download my data button", () => {
    renderSecurity();

    expect(screen.getByRole("button", { name: /download my data/i })).toBeInTheDocument();
  });

  it("renders the Delete my account button", () => {
    renderSecurity();

    expect(screen.getByRole("button", { name: /delete my account/i })).toBeInTheDocument();
  });
});

describe("Security — info alert", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.removeItem(STORAGE_KEY);
  });

  afterEach(() => {
    localStorage.removeItem(STORAGE_KEY);
  });

  it("shows the info alert when it has not been dismissed", () => {
    renderSecurity();

    expect(
      screen.getByText(/Two-factor authentication adds an extra layer of security/i)
    ).toBeInTheDocument();
  });

  it("hides the info alert when the localStorage key is already set", () => {
    localStorage.setItem(STORAGE_KEY, "1");
    renderSecurity();

    expect(
      screen.queryByText(/Two-factor authentication adds an extra layer of security/i)
    ).not.toBeInTheDocument();
  });

  it("renders a Dismiss button inside the alert", () => {
    renderSecurity();

    expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
  });

  it("clicking Dismiss hides the alert", async () => {
    const user = userEvent.setup();
    renderSecurity();

    expect(
      screen.getByText(/Two-factor authentication adds an extra layer of security/i)
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(
      screen.queryByText(/Two-factor authentication adds an extra layer of security/i)
    ).not.toBeInTheDocument();
  });

  it("clicking Dismiss persists the dismissal in localStorage", async () => {
    const user = userEvent.setup();
    renderSecurity();

    await user.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(localStorage.getItem(STORAGE_KEY)).toBe("1");
  });

  it("alert does not reappear after dismissal without clearing localStorage", async () => {
    const user = userEvent.setup();
    renderSecurity();

    await user.click(screen.getByRole("button", { name: "Dismiss" }));

    // Re-render a fresh instance (simulates page navigation back)
    renderSecurity();

    expect(
      screen.queryByText(/Two-factor authentication adds an extra layer of security/i)
    ).not.toBeInTheDocument();
  });

  it("mentions that the account contains sensitive financial data", () => {
    renderSecurity();

    expect(
      screen.getByText(/sensitive financial data/i)
    ).toBeInTheDocument();
  });
});

describe("Security — delete account flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.removeItem(STORAGE_KEY);
  });

  it("does not show the delete modal initially", () => {
    renderSecurity();

    expect(screen.queryByTestId("delete-account-modal")).not.toBeInTheDocument();
  });

  it("clicking Delete my account opens the confirmation modal", async () => {
    const user = userEvent.setup();
    renderSecurity();

    await user.click(screen.getByRole("button", { name: /delete my account/i }));

    expect(screen.getByTestId("delete-account-modal")).toBeInTheDocument();
  });

  it("closing the modal hides it", async () => {
    const user = userEvent.setup();
    renderSecurity();

    await user.click(screen.getByRole("button", { name: /delete my account/i }));
    expect(screen.getByTestId("delete-account-modal")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Close modal" }));
    expect(screen.queryByTestId("delete-account-modal")).not.toBeInTheDocument();
  });
});

describe("Security — data export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.removeItem(STORAGE_KEY);
    // Reset URL mock
    global.URL.createObjectURL = vi.fn().mockReturnValue("blob:mock");
    global.URL.revokeObjectURL = vi.fn();
  });

  it("clicking Download my data triggers export and shows success toast", async () => {
    const { showSuccess } = await import("@/shared/lib/toast-store");
    const user = userEvent.setup();
    renderSecurity();

    await user.click(screen.getByRole("button", { name: /download my data/i }));

    await waitFor(() => {
      expect(showSuccess).toHaveBeenCalledWith("Your data export is downloading.");
    });
  });
});
