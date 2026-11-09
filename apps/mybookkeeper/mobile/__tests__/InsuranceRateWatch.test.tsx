import api from "@platform/core/lib/api";
import type { InsuranceMarketWatch } from "@mybookkeeper/api-client/types/insurance/insurance-market-watch";
import type { InsurancePolicyRateOutlook } from "@mybookkeeper/api-client/types/insurance/insurance-policy-rate-outlook";
import type { InsuranceRateFiling } from "@mybookkeeper/api-client/types/insurance/insurance-rate-filing";
import { fireEvent, screen } from "@testing-library/react-native";
import RateWatchScreen from "../src/features/insurance/RateWatchScreen";
import { EMPTY_RATE_WATCH, startInsuranceServer } from "../test-support/insuranceServer";
import { renderInsurance, resetInsuranceStore } from "../test-support/renderInsurance";

jest.mock("expo-router", () => ({ router: { back: jest.fn(), push: jest.fn() } }));

const originalAdapter = api.defaults.adapter;

beforeEach(() => {
  resetInsuranceStore();
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
});

function aFiling(n: number, overrides: Partial<InsuranceRateFiling> = {}): InsuranceRateFiling {
  return {
    serff_id: `s${n}`,
    company_name: `Carrier ${n}`,
    product_name: null,
    percent_change: 0,
    filed_date: "2026-01-01",
    effective_date_renewal: "2026-09-01",
    is_in_force: true,
    is_pending: false,
    ...overrides,
  };
}

function anOutlook(overrides: Partial<InsurancePolicyRateOutlook> = {}): InsurancePolicyRateOutlook {
  return {
    policy_id: "p1",
    policy_name: "Landlord policy",
    policy_label: "Landlord policy",
    property_name: "Oak Street",
    carrier: "Acme Mutual",
    is_checkable: true,
    expiration_date: "2027-01-01",
    current_premium_cents: 120_000,
    filings: [aFiling(9, { percent_change: 10 })],
    projected_change_pct: 10,
    projected_premium_cents: 132_000,
    unavailable_reason: null,
    ...overrides,
  };
}

function results(overrides: Partial<InsuranceMarketWatch> = {}): InsuranceMarketWatch {
  return { ...EMPTY_RATE_WATCH, outlooks: [anOutlook()], checked_policy_count: 1, has_any_increase: true, ...overrides };
}

describe("rate watch", () => {
  it("waits for the host to ask, and calls nothing on open", async () => {
    const server = startInsuranceServer({ rateWatch: results() });
    await renderInsurance(<RateWatchScreen />);
    expect(await screen.findByRole("button", { name: "Check filings" })).toBeTruthy();
    expect(screen.getByText(/Texas carriers have to file a rate change/)).toBeTruthy();
    expect(server.requests.filter((request) => request.url === "/insurance-market/rate-watch")).toHaveLength(0);
  });

  it("shows the outlook for each policy and the caveat once checked", async () => {
    startInsuranceServer({ rateWatch: results({ market_flat: [aFiling(1)], market_rising: [aFiling(2, { percent_change: 8 })] }) });
    await renderInsurance(<RateWatchScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: "Check filings" }));
    expect(await screen.findByTestId("rate-watch-results")).toBeTruthy();
    expect(screen.getAllByText(/Landlord policy/).length).toBeGreaterThan(0);
    expect(screen.getByText("Holding rates flat")).toBeTruthy();
    expect(screen.getByText("Raising rates")).toBeTruthy();
    expect(screen.getByText(/statewide average/)).toBeTruthy();
    expect(screen.getByText("What to do")).toBeTruthy();
  });

  it("shows a skeleton while the filings are being checked", async () => {
    startInsuranceServer();
    api.defaults.adapter = ((config: { url?: string }) => (config.url === "/insurance-market/rate-watch" ? new Promise(() => undefined) : Promise.resolve({ data: [{ id: "w1", name: "Mine", org_role: "owner" }], status: 200, statusText: "", headers: {}, config }))) as never;
    await renderInsurance(<RateWatchScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: "Check filings" }));
    expect(await screen.findByTestId("rate-watch-skeleton")).toBeTruthy();
    expect(screen.getByText("Checking filings…")).toBeTruthy();
  });

  it("says plainly when the filing data can't be reached", async () => {
    startInsuranceServer({ failures: { "GET /insurance-market/rate-watch": 500 } });
    await renderInsurance(<RateWatchScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: "Check filings" }));
    expect(await screen.findByText("I couldn't reach the filing data. Nothing is wrong with your policies. Try again shortly.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Check filings" })).toBeTruthy();
  });

  it("says plainly when the host has no active policies", async () => {
    startInsuranceServer({ rateWatch: EMPTY_RATE_WATCH });
    await renderInsurance(<RateWatchScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: "Check filings" }));
    expect(await screen.findByText(/You don't have any active policies yet/)).toBeTruthy();
  });

  it("keeps a long list of carriers to five until asked for the rest", async () => {
    const flat = [1, 2, 3, 4, 5, 6, 7].map((n) => aFiling(n));
    startInsuranceServer({ rateWatch: results({ market_flat: flat }) });
    await renderInsurance(<RateWatchScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: "Check filings" }));
    await screen.findByText("Carrier 1");
    expect(screen.queryByText("Carrier 6")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Show 2 more" }));
    expect(screen.getByText("Carrier 7")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Show \d+ more/ })).toBeNull();
  });

  it("shows the reason when the state feed was unreachable", async () => {
    startInsuranceServer({ rateWatch: results({ feed_unavailable_reason: "The Texas feed is down." }) });
    await renderInsurance(<RateWatchScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: "Check filings" }));
    expect(await screen.findByText("The Texas feed is down.")).toBeTruthy();
  });

  it("is open to a viewer, since checking changes nothing", async () => {
    startInsuranceServer({ role: "viewer", rateWatch: results() });
    await renderInsurance(<RateWatchScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: "Check filings" }));
    expect(await screen.findByTestId("rate-watch-results")).toBeTruthy();
  });
});
