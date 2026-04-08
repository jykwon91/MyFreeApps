import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Security from "@/app/pages/Security";

const STORAGE_KEY = "security-info-dismissed";

// TwoFactorSetup makes a network call on mount — mock it to prevent test noise.
vi.mock("@/app/features/security/TwoFactorSetup", () => ({
  default: () => <div data-testid="two-factor-setup">TwoFactorSetup</div>,
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
