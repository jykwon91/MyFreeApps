/**
 * Unit tests for the UtilityPlans list page.
 *
 * Verifies:
 * - Loading skeleton mirrors the loaded row structure
 * - Error state with retry
 * - Empty states (all plans / needs-renewing filter active)
 * - Rows render provider, rate, term countdown and status badge
 * - The "needs renewing" filter keys off derived status, not the raw date
 * - Superseded plans stay listed but are marked as history
 * - Delete surfaces success and failure
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { store } from "@/shared/store";
import UtilityPlans from "@/app/pages/UtilityPlans";
import { showError, showSuccess } from "@/shared/lib/toast-store";
import type { UtilityPlanSummary } from "@/shared/types/utility/utility-plan-summary";

// ── Mocks ───────────────────────────────────────────────────────────────────

const mockRefetch = vi.fn();
const mockDeleteUnwrap = vi.fn();
let mockIsLoading = false;
let mockIsError = false;
let mockIsFetching = false;
let mockPlans: UtilityPlanSummary[] = [];

vi.mock("@/shared/store/utilityPlansApi", () => ({
  useGetUtilityPlansQuery: vi.fn(() => ({
    data: { items: mockPlans, total: mockPlans.length, has_more: false },
    isLoading: mockIsLoading,
    isError: mockIsError,
    isFetching: mockIsFetching,
    refetch: mockRefetch,
  })),
  useDeleteUtilityPlanMutation: vi.fn(() => [
    vi.fn(() => ({ unwrap: mockDeleteUnwrap })),
    { isLoading: false },
  ]),
  useCreateUtilityPlanMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useGetUtilityPlanRenewalAlertsQuery: vi.fn(() => ({ data: undefined })),
}));

vi.mock("@/shared/store/propertiesApi", () => ({
  useGetPropertiesQuery: vi.fn(() => ({ data: [{ id: "prop-1", name: "6738 Peerless St" }] })),
}));

vi.mock("@/shared/lib/toast-store", () => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

// ── Test data ────────────────────────────────────────────────────────────────

function makePlan(overrides: Partial<UtilityPlanSummary> = {}): UtilityPlanSummary {
  return {
    id: "plan-a",
    property_id: "prop-1",
    property_name: "6738 Peerless St",
    service_type: "electricity",
    provider_name: "Constellation",
    plan_name: "FIXED Electricity Plan",
    rate_type: "fixed",
    avg_price_cents_per_kwh_at_1000: "13.9000",
    term_end_date: "2026-01-27",
    days_until_term_end: -192,
    renewal_status: "expired",
    is_current: true,
    created_at: "2025-01-27T00:00:00Z",
    updated_at: "2025-01-27T00:00:00Z",
    ...overrides,
  };
}

const GAS_PLAN = makePlan({
  id: "plan-gas",
  property_name: "6734 Peerless St",
  service_type: "natural_gas",
  provider_name: "CenterPoint Energy",
  plan_name: null,
  rate_type: "regulated",
  avg_price_cents_per_kwh_at_1000: null,
  term_end_date: null,
  days_until_term_end: null,
  renewal_status: "not_applicable",
});

function renderPage() {
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <UtilityPlans />
      </MemoryRouter>
    </Provider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockIsLoading = false;
  mockIsError = false;
  mockIsFetching = false;
  mockPlans = [];
  mockDeleteUnwrap.mockResolvedValue(undefined);
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("UtilityPlans — load states", () => {
  it("shows a skeleton whose rows match the loaded row shape", () => {
    mockIsLoading = true;

    renderPage();

    const skeleton = screen.getByTestId("utility-plans-loading");
    expect(skeleton).toHaveAttribute("aria-busy", "true");
    // Three placeholder rows, each with a badge slot on the right — same shape
    // as a loaded row, so nothing shifts when the data arrives.
    expect(skeleton.querySelectorAll(".rounded-full")).toHaveLength(3);
  });

  it("offers a retry when the query fails", async () => {
    mockIsError = true;
    const user = userEvent.setup();

    renderPage();
    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it("prompts the operator to add a plan when there are none", () => {
    renderPage();

    expect(screen.getByTestId("utility-plans-empty")).toHaveTextContent(
      "No utility plans yet",
    );
  });
});

describe("UtilityPlans — rows", () => {
  it("renders provider, rate and how long ago the term lapsed", () => {
    mockPlans = [makePlan()];

    renderPage();

    const row = screen.getByTestId("utility-plan-item-plan-a");
    expect(row).toHaveTextContent("6738 Peerless St");
    expect(row).toHaveTextContent("Electricity");
    expect(row).toHaveTextContent("Constellation");
    expect(row).toHaveTextContent("13.9¢/kWh at 1,000 kWh");
    expect(row).toHaveTextContent("Lapsed 192 days ago");
    expect(screen.getByTestId("utility-plan-status-expired")).toBeInTheDocument();
  });

  it("marks a superseded plan as history instead of hiding it", () => {
    // The previous rate is the baseline a new offer is measured against, so it
    // must stay visible — but it must not read as the live contract.
    mockPlans = [makePlan({ id: "plan-old", is_current: false })];

    renderPage();

    expect(screen.getByTestId("utility-plan-item-plan-old")).toHaveTextContent(
      "Superseded — kept for rate history",
    );
  });

  it("renders a regulated plan with no term as not-applicable", () => {
    mockPlans = [GAS_PLAN];

    renderPage();

    expect(screen.getByTestId("utility-plan-status-not_applicable")).toBeInTheDocument();
    expect(screen.getByTestId("utility-plan-item-plan-gas")).not.toHaveTextContent(
      "Term ends",
    );
  });
});

describe("UtilityPlans — needs-renewing filter", () => {
  it("keeps only current plans whose derived status is actionable", async () => {
    const user = userEvent.setup();
    mockPlans = [
      makePlan({ id: "plan-expired" }),
      makePlan({ id: "plan-soon", renewal_status: "expiring_soon", days_until_term_end: 12 }),
      makePlan({ id: "plan-active", renewal_status: "active", days_until_term_end: 300 }),
      // Regulated gas has a provider monopoly — nothing to renew, so it must
      // not be swept in even though it is current.
      GAS_PLAN,
      // Already superseded: its lapse is history, not an action.
      makePlan({ id: "plan-old", is_current: false }),
    ];

    renderPage();
    await user.click(screen.getByTestId("utility-plans-expiring-toggle"));

    expect(screen.getByTestId("utility-plan-item-plan-expired")).toBeInTheDocument();
    expect(screen.getByTestId("utility-plan-item-plan-soon")).toBeInTheDocument();
    expect(screen.queryByTestId("utility-plan-item-plan-active")).not.toBeInTheDocument();
    expect(screen.queryByTestId("utility-plan-item-plan-gas")).not.toBeInTheDocument();
    expect(screen.queryByTestId("utility-plan-item-plan-old")).not.toBeInTheDocument();
  });

  it("says nothing needs renewing when the filter empties the list", async () => {
    const user = userEvent.setup();
    mockPlans = [makePlan({ renewal_status: "active", days_until_term_end: 300 })];

    renderPage();
    await user.click(screen.getByTestId("utility-plans-expiring-toggle"));

    expect(screen.getByTestId("utility-plans-empty")).toHaveTextContent(
      "No plans are expiring soon",
    );
  });
});

describe("UtilityPlans — delete", () => {
  it("confirms removal on success", async () => {
    const user = userEvent.setup();
    mockPlans = [makePlan()];

    renderPage();
    await user.click(screen.getByTestId("utility-plan-delete-plan-a"));

    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith("Utility plan removed."));
  });

  it("surfaces a failure instead of silently leaving the row", async () => {
    const user = userEvent.setup();
    mockPlans = [makePlan()];
    mockDeleteUnwrap.mockRejectedValue(new Error("boom"));

    renderPage();
    await user.click(screen.getByTestId("utility-plan-delete-plan-a"));

    await waitFor(() =>
      expect(showError).toHaveBeenCalledWith("Couldn't remove the plan. Please try again."),
    );
  });
});

describe("UtilityPlans — add dialog", () => {
  it("opens on the Add plan button", async () => {
    const user = userEvent.setup();

    renderPage();
    await user.click(screen.getByTestId("add-utility-plan-button"));

    expect(screen.getByTestId("add-utility-plan-dialog")).toBeInTheDocument();
  });
});
