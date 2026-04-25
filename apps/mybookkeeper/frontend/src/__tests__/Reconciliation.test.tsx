import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { BrowserRouter } from "react-router-dom";
import { store } from "@/shared/store";
import Reconciliation from "@/app/pages/Reconciliation";

const STORAGE_KEY = "recon-info-dismissed";

// ReconciliationWizard makes RTK Query network calls — mock it to isolate the page shell.
vi.mock("@/app/features/reconciliation/ReconciliationWizard", () => ({
  default: ({ onToast }: { onToast: (msg: string, v: "success" | "error") => void }) => (
    <div data-testid="reconciliation-wizard">
      <button onClick={() => onToast("Test success", "success")}>Trigger success toast</button>
      <button onClick={() => onToast("Test error", "error")}>Trigger error toast</button>
    </div>
  ),
}));

vi.mock("@/shared/lib/toast-store", () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

import { showSuccess, showError } from "@/shared/lib/toast-store";

function renderWithProviders() {
  return render(
    <Provider store={store}>
      <BrowserRouter>
        <Reconciliation />
      </BrowserRouter>
    </Provider>
  );
}

describe("Reconciliation — page structure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.removeItem(STORAGE_KEY);
  });

  afterEach(() => {
    localStorage.removeItem(STORAGE_KEY);
  });

  it("renders the Reconciliation heading", () => {
    renderWithProviders();

    expect(screen.getByText("Reconciliation")).toBeInTheDocument();
  });

  it("renders the page subtitle", () => {
    renderWithProviders();

    expect(
      screen.getByText(/Compare 1099 forms against your reservation records/i)
    ).toBeInTheDocument();
  });

  it("renders the ReconciliationWizard component", () => {
    renderWithProviders();

    expect(screen.getByTestId("reconciliation-wizard")).toBeInTheDocument();
  });
});

describe("Reconciliation — info alert", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.removeItem(STORAGE_KEY);
  });

  afterEach(() => {
    localStorage.removeItem(STORAGE_KEY);
  });

  it("shows the info alert when it has not been dismissed", () => {
    renderWithProviders();

    expect(
      screen.getByText(/Reconciliation compares what your rental platform/i)
    ).toBeInTheDocument();
  });

  it("hides the info alert when the localStorage key is already set", () => {
    localStorage.setItem(STORAGE_KEY, "1");
    renderWithProviders();

    expect(
      screen.queryByText(/Reconciliation compares what your rental platform/i)
    ).not.toBeInTheDocument();
  });

  it("renders a Dismiss button inside the alert", () => {
    renderWithProviders();

    expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
  });

  it("clicking Dismiss hides the alert", async () => {
    const user = userEvent.setup();
    renderWithProviders();

    await user.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(
      screen.queryByText(/Reconciliation compares what your rental platform/i)
    ).not.toBeInTheDocument();
  });

  it("clicking Dismiss persists the dismissal in localStorage", async () => {
    const user = userEvent.setup();
    renderWithProviders();

    await user.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(localStorage.getItem(STORAGE_KEY)).toBe("1");
  });

  it("dismissed state persists across re-renders", async () => {
    const user = userEvent.setup();
    renderWithProviders();

    await user.click(screen.getByRole("button", { name: "Dismiss" }));

    renderWithProviders();

    const alerts = screen.queryAllByText(/Reconciliation compares what your rental platform/i);
    expect(alerts).toHaveLength(0);
  });

  it("mentions audit risk in the info alert", () => {
    renderWithProviders();

    expect(screen.getByText(/flag you for an audit/i)).toBeInTheDocument();
  });
});

describe("Reconciliation — toast forwarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.removeItem(STORAGE_KEY);
  });

  afterEach(() => {
    localStorage.removeItem(STORAGE_KEY);
  });

  it("calls showSuccess when the wizard triggers a success toast", async () => {
    const user = userEvent.setup();
    renderWithProviders();

    await user.click(screen.getByRole("button", { name: "Trigger success toast" }));

    expect(showSuccess).toHaveBeenCalledWith("Test success");
  });

  it("calls showError when the wizard triggers an error toast", async () => {
    const user = userEvent.setup();
    renderWithProviders();

    await user.click(screen.getByRole("button", { name: "Trigger error toast" }));

    expect(showError).toHaveBeenCalledWith("Test error");
  });
});
