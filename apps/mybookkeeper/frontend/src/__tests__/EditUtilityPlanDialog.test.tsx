/**
 * Unit tests for the utility-plan edit dialog.
 *
 * Verifies:
 * - A skeleton stands in while the plan loads, and an error offers a retry
 * - Fields are prefilled from the loaded plan
 * - Save sends only the edited keys, leaving untouched terms alone
 * - Success closes the dialog; failure keeps it open with the edits intact
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EditUtilityPlanDialog from "@/app/features/utility/EditUtilityPlanDialog";
import { showError, showSuccess } from "@/shared/lib/toast-store";
import type { UtilityPlanDetail } from "@/shared/types/utility/utility-plan-detail";

// ── Mocks ───────────────────────────────────────────────────────────────────

const mockUpdate = vi.fn();
const mockUpdateUnwrap = vi.fn();
const mockRefetch = vi.fn();

let mockPlan: UtilityPlanDetail | undefined;
let mockIsLoading = false;
let mockIsError = false;

vi.mock("@/shared/store/utilityPlansApi", () => ({
  useGetUtilityPlanByIdQuery: vi.fn(() => ({
    data: mockPlan,
    isLoading: mockIsLoading,
    isError: mockIsError,
    isFetching: false,
    refetch: mockRefetch,
  })),
  useUpdateUtilityPlanMutation: vi.fn(() => [mockUpdate, { isLoading: false }]),
}));

vi.mock("@/shared/lib/toast-store", () => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

// ── Test data ────────────────────────────────────────────────────────────────

const PLAN: UtilityPlanDetail = {
  id: "plan-a",
  user_id: "user-1",
  organization_id: "org-1",
  property_id: "prop-1",
  property_name: "6734 Peerless St",
  service_type: "electricity",
  provider_name: "Constellation",
  account_number: "204430810",
  plan_name: "FIXED Electricity Plan",
  rate_type: "fixed",
  energy_charge_cents_per_kwh: "11.6000",
  tdu_charge_cents_per_kwh: "5.3509",
  avg_price_cents_per_kwh_at_1000: "13.9000",
  monthly_base_charge_cents: 439,
  term_months: 12,
  service_start_date: "2025-01-23",
  term_end_date: "2026-01-23",
  early_termination_fee_cents: 15000,
  has_bill_credit: false,
  bill_credit_amount_cents: null,
  bill_credit_threshold_kwh: null,
  min_usage_fee_cents: 0,
  min_usage_threshold_kwh: 999,
  notes: "Account number unresolved — set it from a bill.",
  days_until_term_end: -196,
  renewal_status: "expired",
  is_current: true,
  created_at: "2025-01-23T00:00:00Z",
  updated_at: "2025-01-23T00:00:00Z",
};

const onClose = vi.fn();

function renderDialog() {
  return render(<EditUtilityPlanDialog planId="plan-a" onClose={onClose} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPlan = PLAN;
  mockIsLoading = false;
  mockIsError = false;
  mockUpdateUnwrap.mockResolvedValue(PLAN);
  mockUpdate.mockReturnValue({ unwrap: mockUpdateUnwrap });
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("EditUtilityPlanDialog — load states", () => {
  it("shows a skeleton instead of an empty form while the plan loads", () => {
    mockPlan = undefined;
    mockIsLoading = true;

    renderDialog();

    const skeleton = screen.getByTestId("utility-plan-form-loading");
    expect(skeleton).toHaveAttribute("aria-busy", "true");
    // No inputs yet — a form seeded from absent data would blank the plan on
    // save, so it must not render before the data lands.
    expect(screen.queryByTestId("utility-plan-provider-input")).not.toBeInTheDocument();
  });

  it("offers a retry when the plan fails to load", async () => {
    mockPlan = undefined;
    mockIsError = true;
    const user = userEvent.setup();

    renderDialog();
    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });
});

describe("EditUtilityPlanDialog — prefill", () => {
  it("fills every field from the loaded plan", () => {
    renderDialog();

    expect(screen.getByTestId("utility-plan-provider-input")).toHaveValue("Constellation");
    expect(screen.getByTestId("utility-plan-name-input")).toHaveValue(
      "FIXED Electricity Plan",
    );
    expect(screen.getByTestId("utility-plan-account-input")).toHaveValue("204430810");
    expect(screen.getByTestId("utility-plan-energy-input")).toHaveValue(11.6);
    expect(screen.getByTestId("utility-plan-tdu-input")).toHaveValue(5.3509);
    expect(screen.getByTestId("utility-plan-base-charge-input")).toHaveValue(4.39);
    expect(screen.getByTestId("utility-plan-etf-input")).toHaveValue(150);
    expect(screen.getByTestId("utility-plan-end-date-input")).toHaveValue("2026-01-23");
  });

  it("shows the property as context rather than as a field to change", () => {
    // A plan cannot be moved between properties — doing so would rewrite the
    // other property's rate history.
    renderDialog();

    expect(screen.getByTestId("edit-utility-plan-property")).toHaveTextContent(
      "6734 Peerless St",
    );
    expect(screen.queryByTestId("utility-plan-property-select")).not.toBeInTheDocument();
  });
});

describe("EditUtilityPlanDialog — save", () => {
  it("patches the edited field and leaves the rest as they were", async () => {
    const user = userEvent.setup();

    renderDialog();
    const provider = screen.getByTestId("utility-plan-provider-input");
    await user.clear(provider);
    await user.type(provider, "Reliant");
    await user.click(screen.getByTestId("utility-plan-save-button"));

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
    const [{ planId, data }] = mockUpdate.mock.calls[0] as [
      { planId: string; data: Record<string, unknown> },
    ];
    expect(planId).toBe("plan-a");
    expect(data.provider_name).toBe("Reliant");
    expect(data.tdu_charge_cents_per_kwh).toBe("5.3509");
    expect(data.term_end_date).toBe("2026-01-23");
  });

  /**
   * PATCH applies exactly the keys it receives, so a key the form does not own
   * must never appear — sending null would erase the minimum-usage terms and
   * the provenance note this plan carries.
   */
  it("never sends the fields it cannot edit", async () => {
    const user = userEvent.setup();

    renderDialog();
    await user.click(screen.getByTestId("utility-plan-save-button"));

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
    const [{ data }] = mockUpdate.mock.calls[0] as [{ data: Record<string, unknown> }];
    expect(data).not.toHaveProperty("min_usage_fee_cents");
    expect(data).not.toHaveProperty("min_usage_threshold_kwh");
    expect(data).not.toHaveProperty("notes");
    expect(data).not.toHaveProperty("property_id");
  });

  it("confirms and closes on success", async () => {
    const user = userEvent.setup();

    renderDialog();
    await user.click(screen.getByTestId("utility-plan-save-button"));

    await waitFor(() =>
      expect(showSuccess).toHaveBeenCalledWith("Utility plan updated."),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps the dialog open with the edits intact when the save fails", async () => {
    const user = userEvent.setup();
    mockUpdateUnwrap.mockRejectedValue(new Error("boom"));

    renderDialog();
    const provider = screen.getByTestId("utility-plan-provider-input");
    await user.clear(provider);
    await user.type(provider, "Reliant");
    await user.click(screen.getByTestId("utility-plan-save-button"));

    await waitFor(() =>
      expect(showError).toHaveBeenCalledWith(
        "Couldn't save the changes. Please try again.",
      ),
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId("utility-plan-provider-input")).toHaveValue("Reliant");
  });

  it("does not submit an emptied provider", async () => {
    // The input is `required`, so this never reaches the handler — the guard
    // that matters here is simply that nothing is sent.
    const user = userEvent.setup();

    renderDialog();
    await user.clear(screen.getByTestId("utility-plan-provider-input"));
    await user.click(screen.getByTestId("utility-plan-save-button"));

    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("blocks a whitespace-only provider, which `required` lets through", async () => {
    const user = userEvent.setup();

    renderDialog();
    const provider = screen.getByTestId("utility-plan-provider-input");
    await user.clear(provider);
    await user.type(provider, "   ");
    await user.click(screen.getByTestId("utility-plan-save-button"));

    await waitFor(() =>
      expect(showError).toHaveBeenCalledWith("Provider is required."),
    );
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("requires both halves of a bill credit once the box is ticked", async () => {
    const user = userEvent.setup();

    renderDialog();
    await user.click(screen.getByTestId("utility-plan-bill-credit-toggle"));
    await user.type(screen.getByTestId("utility-plan-credit-amount-input"), "35");
    await user.click(screen.getByTestId("utility-plan-save-button"));

    await waitFor(() =>
      expect(showError).toHaveBeenCalledWith(
        "A bill credit needs both an amount and a usage threshold.",
      ),
    );
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
