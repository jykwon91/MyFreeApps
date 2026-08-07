/**
 * Unit tests for the dashboard utility-plan renewal card.
 *
 * The behaviour worth protecting is when the card is *absent*: it must
 * disappear for operators who track no plans (an always-empty dashboard card
 * is noise) while still saying "nothing is due" for operators who do — silence
 * and "all clear" are different messages.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { store } from "@/shared/store";
import UtilityPlanRenewalAlertCard from "@/app/features/utility/UtilityPlanRenewalAlertCard";
import type { UtilityPlanRenewalAlert } from "@/shared/types/utility/utility-plan-renewal-alert";
import type { UtilityPlanSummary } from "@/shared/types/utility/utility-plan-summary";

// ── Mocks ───────────────────────────────────────────────────────────────────

const mockRefetch = vi.fn();
let mockAlerts: UtilityPlanRenewalAlert | undefined;
let mockAlertsLoading = false;
let mockAlertsError = false;
let mockPlanTotal = 0;
let mockPlansLoading = false;

vi.mock("@/shared/store/utilityPlansApi", () => ({
  useGetUtilityPlanRenewalAlertsQuery: vi.fn(() => ({
    data: mockAlerts,
    isLoading: mockAlertsLoading,
    isError: mockAlertsError,
    isFetching: false,
    refetch: mockRefetch,
  })),
  useGetUtilityPlansQuery: vi.fn(() => ({
    data: { items: [], total: mockPlanTotal, has_more: false },
    isLoading: mockPlansLoading,
  })),
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

function renderCard() {
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <UtilityPlanRenewalAlertCard />
      </MemoryRouter>
    </Provider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAlerts = undefined;
  mockAlertsLoading = false;
  mockAlertsError = false;
  mockPlanTotal = 0;
  mockPlansLoading = false;
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("UtilityPlanRenewalAlertCard — when it renders at all", () => {
  it("renders nothing when the operator tracks no utility plans", () => {
    mockPlanTotal = 0;
    mockAlerts = { window_days: 45, expired: [], expiring_soon: [], total_needing_attention: 0 };

    const { container } = renderCard();

    expect(container).toBeEmptyDOMElement();
  });

  it("states the all-clear once at least one plan is tracked", () => {
    mockPlanTotal = 5;
    mockAlerts = { window_days: 45, expired: [], expiring_soon: [], total_needing_attention: 0 };

    renderCard();

    expect(screen.getByTestId("utility-plan-alert-card-clear")).toHaveTextContent(
      "No utility plans need renewing in the next 45 days.",
    );
  });

  it("shows a skeleton matching the loaded card while loading", () => {
    mockAlertsLoading = true;

    renderCard();

    const skeleton = screen.getByTestId("utility-plan-alert-card-loading");
    expect(skeleton).toHaveAttribute("aria-busy", "true");
    // Two placeholder rows, each ending in a badge slot — the loaded shape.
    expect(skeleton.querySelectorAll(".rounded-full")).toHaveLength(2);
  });

  it("offers a retry when the alerts query fails", async () => {
    mockAlertsError = true;
    mockPlanTotal = 3;
    const user = userEvent.setup();

    renderCard();
    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });
});

describe("UtilityPlanRenewalAlertCard — alerts", () => {
  beforeEach(() => {
    mockPlanTotal = 5;
  });

  it("leads with lapsed plans and explains why they matter", () => {
    mockAlerts = {
      window_days: 45,
      expired: [makePlan({ id: "plan-expired" })],
      expiring_soon: [
        makePlan({ id: "plan-soon", renewal_status: "expiring_soon", days_until_term_end: 12 }),
      ],
      total_needing_attention: 2,
    };

    renderCard();

    expect(screen.getByTestId("utility-plan-alert-card")).toHaveTextContent(
      "Utility plans needing renewal (2)",
    );
    expect(screen.getByText("Already lapsed — likely on a holdover rate")).toBeInTheDocument();
    expect(screen.getByTestId("utility-plan-alert-plan-expired")).toHaveTextContent(
      "Lapsed 192 days ago",
    );
    expect(screen.getByTestId("utility-plan-alert-plan-soon")).toHaveTextContent(
      "Ends in 12 days",
    );
  });

  it("omits the lapsed section entirely when nothing has lapsed", () => {
    mockAlerts = {
      window_days: 45,
      expired: [],
      expiring_soon: [
        makePlan({ id: "plan-soon", renewal_status: "expiring_soon", days_until_term_end: 12 }),
      ],
      total_needing_attention: 1,
    };

    renderCard();

    expect(
      screen.queryByText("Already lapsed — likely on a holdover rate"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Expiring within 45 days")).toBeInTheDocument();
  });

  it("uses the backend's window rather than a hardcoded number", () => {
    mockAlerts = {
      window_days: 60,
      expired: [],
      expiring_soon: [makePlan({ renewal_status: "expiring_soon", days_until_term_end: 50 })],
      total_needing_attention: 1,
    };

    renderCard();

    expect(screen.getByText("Expiring within 60 days")).toBeInTheDocument();
  });

  it("links through to the full list", () => {
    mockAlerts = {
      window_days: 45,
      expired: [makePlan()],
      expiring_soon: [],
      total_needing_attention: 1,
    };

    renderCard();

    expect(screen.getByRole("link", { name: "View all" })).toHaveAttribute(
      "href",
      "/utility-plans",
    );
  });
});
