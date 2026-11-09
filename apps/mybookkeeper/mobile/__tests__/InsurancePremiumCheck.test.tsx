import api from "@platform/core/lib/api";
import type { InsurancePremiumComparisonRow } from "@mybookkeeper/api-client/types/insurance/insurance-premium-comparison-row";
import { fireEvent, screen } from "@testing-library/react-native";
import PremiumCheckCard from "../src/features/insurance/PremiumCheckCard";
import { aBenchmark, NOTHING_TRACKED, startInsuranceServer } from "../test-support/insuranceServer";
import { renderInsurance, resetInsuranceStore } from "../test-support/renderInsurance";
import { aInsurancePolicySummary } from "../test-support/aInsurancePolicySummary";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ router: { push: (path: string) => mockPush(path), back: jest.fn() } }));

const originalAdapter = api.defaults.adapter;

beforeEach(() => {
  resetInsuranceStore();
  mockPush.mockClear();
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
});

function aRow(overrides: Partial<InsurancePremiumComparisonRow> = {}): InsurancePremiumComparisonRow {
  return {
    policy: aInsurancePolicySummary(),
    status: "above_market",
    policy_rate_cents_per_1000: "400.00",
    benchmark_rate_cents_per_1000: "300.00",
    gap_pct: "33.3",
    benchmark_is_stale: false,
    ...overrides,
  };
}

describe("premium check card", () => {
  it("shows nothing when no policy is tracked", async () => {
    startInsuranceServer({ comparison: NOTHING_TRACKED });
    await renderInsurance(<PremiumCheckCard />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByText("Premium check")).toBeNull();
  });

  it("asks a writer to record a market premium when policies exist but there's nothing to compare to", async () => {
    startInsuranceServer({ comparison: { ...NOTHING_TRACKED, total_considered: 2 } });
    await renderInsurance(<PremiumCheckCard />);
    await fireEvent.press(await screen.findByRole("button", { name: "Record a market premium" }));
    expect(mockPush).toHaveBeenCalledWith("/insurance/market-premium");
  });

  it("explains the gap to a viewer without offering to fix it", async () => {
    startInsuranceServer({ role: "viewer", comparison: { ...NOTHING_TRACKED, total_considered: 2 } });
    await renderInsurance(<PremiumCheckCard />);
    expect(await screen.findByText(/I haven't got a market premium yet/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Record a market premium" })).toBeNull();
  });

  it("says all clear and what that rests on", async () => {
    startInsuranceServer({ comparison: { ...NOTHING_TRACKED, benchmark: aBenchmark(), total_considered: 3, has_stale_benchmark: true } });
    await renderInsurance(<PremiumCheckCard />);
    expect(await screen.findByText("No policy costs more than 10% above the market premium you recorded, per $1,000 of coverage.")).toBeTruthy();
    expect(screen.getByText(/recorded a while ago\. Worth checking again/)).toBeTruthy();
  });

  it("lists the policies paying above market and those it couldn't check", async () => {
    startInsuranceServer({
      comparison: {
        ...NOTHING_TRACKED,
        benchmark: aBenchmark(),
        total_considered: 2,
        total_above_market: 1,
        above_market: [aRow()],
        not_compared: [aRow({ policy: aInsurancePolicySummary({ id: "p2", policy_name: "Other policy" }), status: "not_comparable", gap_pct: null })],
      },
    });
    await renderInsurance(<PremiumCheckCard />);
    expect(await screen.findByText("Paying above market (1)")).toBeTruthy();
    expect(screen.getByText("Not checked (1)")).toBeTruthy();
  });

  it("offers a retry when the comparison fails", async () => {
    const server = startInsuranceServer({ failures: { "GET /insurance-policies/premium-comparison": 500 } });
    await renderInsurance(<PremiumCheckCard />);
    expect(await screen.findByText("I couldn't compare your premiums to the market.")).toBeTruthy();
    delete server.failures["GET /insurance-policies/premium-comparison"];
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByText("I couldn't compare your premiums to the market.")).toBeNull();
  });
});
