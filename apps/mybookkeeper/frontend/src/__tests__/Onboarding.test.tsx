import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserRouter } from "react-router-dom";
import Onboarding from "@/app/pages/Onboarding";

vi.mock("@/shared/store/taxProfileApi", () => ({
  useCompleteOnboardingMutation: vi.fn(),
}));

vi.mock("@/shared/lib/toast-store", () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

import { useCompleteOnboardingMutation } from "@/shared/store/taxProfileApi";
import { showSuccess, showError } from "@/shared/lib/toast-store";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

function makeMutation(opts: { isLoading?: boolean; fn?: ReturnType<typeof vi.fn> } = {}) {
  const mutationFn = opts.fn ?? vi.fn().mockReturnValue({ unwrap: vi.fn().mockResolvedValue({}) });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(useCompleteOnboardingMutation).mockReturnValue([
    mutationFn as any,
    { isLoading: opts.isLoading ?? false } as any,
  ]);
}

function renderOnboarding() {
  return render(<BrowserRouter><Onboarding /></BrowserRouter>);
}

// ---------------------------------------------------------------------------
// Initial render (step 0 — Tax Situation)
// ---------------------------------------------------------------------------

describe("Onboarding \u2014 step 0 (tax situation)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    makeMutation();
  });

  it("renders the step counter showing Step 1 of 3", () => {
    renderOnboarding();
    expect(screen.getByText("Step 1 of 3")).toBeInTheDocument();
  });

  it("renders Rental Properties as a selectable option", () => {
    renderOnboarding();
    expect(screen.getByText("Rental Properties")).toBeInTheDocument();
  });

  it("renders Self-Employment as a selectable option", () => {
    renderOnboarding();
    expect(screen.getByText("Self-Employment")).toBeInTheDocument();
  });

  it("renders the Next button initially disabled when no situation is selected", () => {
    renderOnboarding();
    const btn = screen.getByRole("button", { name: "Next" });
    expect(btn).toBeDisabled();
  });

  it("does not show the Back button on the first step", () => {
    renderOnboarding();
    expect(screen.queryByRole("button", { name: "Back" })).not.toBeInTheDocument();
  });

  it("enables the Next button after selecting a tax situation", async () => {
    const user = userEvent.setup();
    renderOnboarding();
    await user.click(screen.getByText("Rental Properties"));
    expect(screen.getByRole("button", { name: "Next" })).not.toBeDisabled();
  });

  it("shows a hint to select at least one option when none are selected", () => {
    renderOnboarding();
    expect(screen.getByText("Select at least one to continue.")).toBeInTheDocument();
  });

  it("hides the hint after selecting a tax situation", async () => {
    const user = userEvent.setup();
    renderOnboarding();
    await user.click(screen.getByText("Rental Properties"));
    expect(screen.queryByText("Select at least one to continue.")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Step navigation
// ---------------------------------------------------------------------------

describe("Onboarding \u2014 step navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    makeMutation();
  });

  async function advanceToStep1() {
    const user = userEvent.setup();
    renderOnboarding();
    await user.click(screen.getByText("Rental Properties"));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Step 2 of 3");
    return user;
  }

  async function advanceToStep2() {
    const user = await advanceToStep1();
    await user.click(screen.getByText("Single"));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Step 3 of 3");
    return user;
  }

  it("advances to step 2 when Next is clicked with a situation selected", async () => {
    await advanceToStep1();
    expect(screen.getByText("Step 2 of 3")).toBeInTheDocument();
  });

  it("shows the filing status options on step 2", async () => {
    await advanceToStep1();
    expect(screen.getByText("Single")).toBeInTheDocument();
    expect(screen.getByText("Married Filing Jointly")).toBeInTheDocument();
  });

  it("shows the Back button on step 2", async () => {
    await advanceToStep1();
    expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
  });

  it("Next button on step 2 is disabled until a filing status is selected", async () => {
    await advanceToStep1();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("enables Next on step 2 after selecting a filing status", async () => {
    const user = await advanceToStep1();
    await user.click(screen.getByText("Single"));
    expect(screen.getByRole("button", { name: "Next" })).not.toBeDisabled();
  });

  it("goes back to step 1 when Back is clicked from step 2", async () => {
    const user = await advanceToStep1();
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText("Step 1 of 3")).toBeInTheDocument();
    expect(screen.getByText("Rental Properties")).toBeInTheDocument();
  });

  it("advances to step 3 when Next is clicked on step 2 with a filing status selected", async () => {
    await advanceToStep2();
    expect(screen.getByText("Step 3 of 3")).toBeInTheDocument();
  });

  it("shows dependents controls on step 3", async () => {
    await advanceToStep2();
    expect(screen.getByText("How many dependents do you have?")).toBeInTheDocument();
  });

  it("shows Finish setup button on the last step", async () => {
    await advanceToStep2();
    expect(screen.getByRole("button", { name: "Finish setup" })).toBeInTheDocument();
  });

  it("Finish setup is enabled on step 3 without any extra action required", async () => {
    await advanceToStep2();
    expect(screen.getByRole("button", { name: "Finish setup" })).not.toBeDisabled();
  });

  it("goes back to step 2 from step 3 when Back is clicked", async () => {
    const user = await advanceToStep2();
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText("Step 2 of 3")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Dependents step controls
// ---------------------------------------------------------------------------

describe("Onboarding \u2014 dependents step controls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    makeMutation();
  });

  async function advanceToStep2() {
    const user = userEvent.setup();
    renderOnboarding();
    await user.click(screen.getByText("Rental Properties"));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByText("Single"));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Step 3 of 3");
    return user;
  }

  it("shows 0 dependents initially", async () => {
    await advanceToStep2();
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("Decrease button is disabled when dependents count is 0", async () => {
    await advanceToStep2();
    expect(screen.getByRole("button", { name: "Decrease" })).toBeDisabled();
  });

  it("increments the dependent count when Increase is clicked", async () => {
    const user = await advanceToStep2();
    await user.click(screen.getByRole("button", { name: "Increase" }));
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("1 dependent")).toBeInTheDocument();
  });

  it("decrements the dependent count when Decrease is clicked after incrementing", async () => {
    const user = await advanceToStep2();
    await user.click(screen.getByRole("button", { name: "Increase" }));
    await user.click(screen.getByRole("button", { name: "Increase" }));
    await user.click(screen.getByRole("button", { name: "Decrease" }));
    expect(screen.getByText("1")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Final submission
// ---------------------------------------------------------------------------

describe("Onboarding \u2014 final submission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function completeWizard(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByText("Rental Properties"));
    await user.click(screen.getByText("W-2 Employment"));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByText("Single"));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Step 3 of 3");
    await user.click(screen.getByRole("button", { name: "Increase" }));
    await user.click(screen.getByRole("button", { name: "Finish setup" }));
  }

  it("calls completeOnboarding with the selected tax situations, filing status, and dependents", async () => {
    const unwrap = vi.fn().mockResolvedValue({});
    const mutationFn = vi.fn().mockReturnValue({ unwrap });
    makeMutation({ fn: mutationFn });
    const user = userEvent.setup();
    renderOnboarding();
    await completeWizard(user);
    await waitFor(() => {
      expect(mutationFn).toHaveBeenCalledWith({
        tax_situations: expect.arrayContaining(["rental_property", "w2_employment"]),
        filing_status: "single",
        dependents_count: 1,
      });
    });
  });

  it("shows a success toast after successful submission", async () => {
    const unwrap = vi.fn().mockResolvedValue({});
    makeMutation({ fn: vi.fn().mockReturnValue({ unwrap }) });
    const user = userEvent.setup();
    renderOnboarding();
    await completeWizard(user);
    await waitFor(() => {
      expect(showSuccess).toHaveBeenCalledWith("You're all set! Let's get started.");
    });
  });

  it("navigates to / after successful submission", async () => {
    const unwrap = vi.fn().mockResolvedValue({});
    makeMutation({ fn: vi.fn().mockReturnValue({ unwrap }) });
    const user = userEvent.setup();
    renderOnboarding();
    await completeWizard(user);
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/");
    });
  });

  it("shows an error toast when submission fails", async () => {
    const unwrap = vi.fn().mockRejectedValue(new Error("Server error"));
    makeMutation({ fn: vi.fn().mockReturnValue({ unwrap }) });
    const user = userEvent.setup();
    renderOnboarding();
    await completeWizard(user);
    await waitFor(() => {
      expect(showError).toHaveBeenCalledWith("Something went wrong. Want to try again?");
    });
  });

  it("does not navigate when submission fails", async () => {
    const unwrap = vi.fn().mockRejectedValue(new Error("Server error"));
    makeMutation({ fn: vi.fn().mockReturnValue({ unwrap }) });
    const user = userEvent.setup();
    renderOnboarding();
    await completeWizard(user);
    await waitFor(() => {
      expect(showError).toHaveBeenCalled();
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
