import type { UtilityPlanRateComparisonRow } from "@mybookkeeper/api-client/types/utility/utility-plan-rate-comparison-row";
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { Linking } from "react-native";
import { Provider } from "react-redux";
import { UTILITY_OFFER_MESSAGES } from "../src/constants/utilityOffers";
import { UTILITY_RATE_CHECK_MESSAGES, UTILITY_RENEWAL_MESSAGES } from "../src/constants/utilityInsights";
import BetterPlansScreen from "../src/features/utilityPlans/BetterPlansScreen";
import UtilityRateCheckScreen from "../src/features/utilityPlans/UtilityRateCheckScreen";
import UtilityRenewalsScreen from "../src/features/utilityPlans/UtilityRenewalsScreen";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";
import { aUtilityOffer, aUtilityOfferGroup } from "../test-support/aUtilityOffer";
import { aUtilityPlanSummary } from "../test-support/aUtilityPlanSummary";
import { aBenchmark } from "../test-support/aMarketRateBenchmark";
import { startUtilityServer } from "../test-support/utilityPlansServer";

const mockBack = jest.fn();
const mockPush = jest.fn();
const mockPreventRemove = { active: false };
jest.mock("expo-router", () => ({
  router: { back: () => mockBack(), canGoBack: () => true, push: (path: string) => mockPush(path), replace: jest.fn() },
  usePreventRemove: (active: boolean) => {
    mockPreventRemove.active = active;
  },
}));
jest.mock("@react-native-community/datetimepicker", () => {
  const { View } = jest.requireActual("react-native");
  return { __esModule: true, default: View, DateTimePickerAndroid: { open: jest.fn() } };
});

const originalAdapter = api.defaults.adapter;
const TRACKED_AND_RECORDED = {
  list: { items: [aUtilityPlanSummary()], total: 1, has_more: false },
  benchmarks: [aBenchmark()],
};

beforeEach(() => {
  session.tokenStore.set("token");
  store.dispatch(baseApi.util.resetApiState());
  store.dispatch(workspaceChosen("w1"));
  jest.clearAllMocks();
  mockPreventRemove.active = false;
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
  jest.restoreAllMocks();
});

async function show(element: ReactElement) {
  await render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>{element}</ToastProvider>
    </Provider>,
  );
}

function aRow(overrides: Partial<UtilityPlanRateComparisonRow> = {}): UtilityPlanRateComparisonRow {
  return {
    plan: aUtilityPlanSummary(),
    status: "above_market",
    plan_figure: "13.9000",
    benchmark_figure: "11.0000",
    gap_pct: "26.4",
    benchmark_is_stale: false,
    ...overrides,
  };
}

describe("UtilityRenewalsScreen", () => {
  it("shows a skeleton while the first answer is on its way", async () => {
    startUtilityServer({ alerts: "hold" });
    await show(<UtilityRenewalsScreen />);
    expect(await screen.findByTestId("utility-plans-skeleton")).toBeTruthy();
  });

  it("lists lapsed plans and plans about to lapse under their own headings, and opens one", async () => {
    startUtilityServer({
      alerts: {
        window_days: 45,
        expired: [aUtilityPlanSummary({ id: "old", service_type: "water", renewal_status: "expired", term_end_date: "2000-01-01" })],
        expiring_soon: [aUtilityPlanSummary({ id: "soon", renewal_status: "expiring_soon", term_end_date: "2099-01-01" })],
        total_needing_attention: 2,
      },
    });
    await show(<UtilityRenewalsScreen />);
    await screen.findByText(UTILITY_RENEWAL_MESSAGES.lapsedHeading);
    expect(screen.getByText(UTILITY_RENEWAL_MESSAGES.expiringHeading(45))).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: /^Oak Street · Water/ }));
    expect(mockPush).toHaveBeenCalledWith("/utility-plans/old");
  });

  it("says all clear in the window the server names", async () => {
    startUtilityServer();
    await show(<UtilityRenewalsScreen />);
    expect(await screen.findByText(UTILITY_RENEWAL_MESSAGES.allClear(45))).toBeTruthy();
  });

  it("offers a retry when it couldn't load, and recovers", async () => {
    const server = startUtilityServer({ alerts: "fail" });
    await show(<UtilityRenewalsScreen />);
    await screen.findByText(UTILITY_RENEWAL_MESSAGES.couldntLoad);
    server.alerts = { window_days: 45, expired: [], expiring_soon: [], total_needing_attention: 0 };
    await fireEvent.press(screen.getByRole("button", { name: UTILITY_RENEWAL_MESSAGES.tryAgain }));
    await screen.findByText(UTILITY_RENEWAL_MESSAGES.allClear(45));
  });
});

describe("UtilityRateCheckScreen", () => {
  it("shows plans priced above the market with the gap and both figures", async () => {
    startUtilityServer({
      ...TRACKED_AND_RECORDED,
      comparison: { material_gap_pct: 10, above_market: [aRow()], not_compared: [], total_above_market: 1, has_stale_benchmark: false },
    });
    await show(<UtilityRateCheckScreen />);
    await screen.findByText(UTILITY_RATE_CHECK_MESSAGES.aboveHeading(10));
    expect(screen.getByText("26.4% above market")).toBeTruthy();
    expect(screen.getByText("Your plan: 13.9¢/kWh")).toBeTruthy();
    expect(screen.getByText("Market: 11¢/kWh")).toBeTruthy();
  });

  it("says when a recorded rate is old", async () => {
    startUtilityServer({
      ...TRACKED_AND_RECORDED,
      comparison: { material_gap_pct: 10, above_market: [aRow({ benchmark_is_stale: true })], not_compared: [], total_above_market: 1, has_stale_benchmark: true },
    });
    await show(<UtilityRateCheckScreen />);
    await screen.findByText(UTILITY_RATE_CHECK_MESSAGES.staleRow);
    expect(screen.getByText(UTILITY_RATE_CHECK_MESSAGES.staleCard)).toBeTruthy();
  });

  it("lists plans that couldn't be checked with the reason", async () => {
    startUtilityServer({
      ...TRACKED_AND_RECORDED,
      comparison: {
        material_gap_pct: 10,
        above_market: [],
        not_compared: [aRow({ plan: aUtilityPlanSummary({ id: "r", rate_type: "regulated" }), status: "not_comparable", gap_pct: null, plan_figure: null, benchmark_figure: null }), aRow({ status: "at_or_below_market", gap_pct: "-4" })],
        total_above_market: 0,
        has_stale_benchmark: false,
      },
    });
    await show(<UtilityRateCheckScreen />);
    await screen.findByText(UTILITY_RATE_CHECK_MESSAGES.allClear(10));
    expect(screen.getByText(UTILITY_RATE_CHECK_MESSAGES.notCheckedHeading(2))).toBeTruthy();
    expect(screen.getByText("Not comparable")).toBeTruthy();
    expect(screen.getByText("4% below market")).toBeTruthy();
  });

  it("sends a writer with no recorded rate to record one, and never says all clear", async () => {
    startUtilityServer({
      list: TRACKED_AND_RECORDED.list,
      benchmarks: [],
      comparison: { material_gap_pct: 10, above_market: [], not_compared: [aRow({ status: "no_benchmark", gap_pct: null })], total_above_market: 0, has_stale_benchmark: false },
    });
    await show(<UtilityRateCheckScreen />);
    await screen.findByText(UTILITY_RATE_CHECK_MESSAGES.noBenchmark);
    expect(screen.queryByText(UTILITY_RATE_CHECK_MESSAGES.allClearHeading)).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: UTILITY_RATE_CHECK_MESSAGES.recordRate }));
    expect(mockPush).toHaveBeenCalledWith("/utility-plans/market-rates");
  });

  it("does not offer a viewer the chance to record a rate", async () => {
    startUtilityServer({ role: "viewer", list: TRACKED_AND_RECORDED.list, benchmarks: [] });
    await show(<UtilityRateCheckScreen />);
    await screen.findByText(UTILITY_RATE_CHECK_MESSAGES.noBenchmarkViewOnly);
    expect(screen.queryByRole("button", { name: UTILITY_RATE_CHECK_MESSAGES.recordRate })).toBeNull();
  });

  it("keys the no-rate state off the recorded rates, not the plan rows", async () => {
    startUtilityServer({
      ...TRACKED_AND_RECORDED,
      benchmarks: [],
      comparison: { material_gap_pct: 10, above_market: [], not_compared: [], total_above_market: 0, has_stale_benchmark: false },
    });
    await show(<UtilityRateCheckScreen />);
    expect(await screen.findByText(UTILITY_RATE_CHECK_MESSAGES.noBenchmarkHeading)).toBeTruthy();
  });

  it("says there is nothing to check, rather than all clear, when no plans are tracked", async () => {
    startUtilityServer({ benchmarks: [aBenchmark()] });
    await show(<UtilityRateCheckScreen />);
    await screen.findByText(UTILITY_RATE_CHECK_MESSAGES.noPlansHeading);
    expect(screen.queryByText(UTILITY_RATE_CHECK_MESSAGES.allClearHeading)).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: UTILITY_RATE_CHECK_MESSAGES.addPlan }));
    expect(mockPush).toHaveBeenCalledWith("/utility-plans/new");
  });

  it("does not read a failed list of recorded rates as none recorded", async () => {
    startUtilityServer({ list: TRACKED_AND_RECORDED.list, benchmarks: "fail" });
    await show(<UtilityRateCheckScreen />);
    expect(await screen.findByText(UTILITY_RATE_CHECK_MESSAGES.couldntLoad)).toBeTruthy();
    expect(screen.queryByText(UTILITY_RATE_CHECK_MESSAGES.noBenchmarkHeading)).toBeNull();
  });

  it("offers a retry when it couldn't load", async () => {
    startUtilityServer({ comparison: "fail" });
    await show(<UtilityRateCheckScreen />);
    expect(await screen.findByText(UTILITY_RATE_CHECK_MESSAGES.couldntLoad)).toBeTruthy();
  });
});

describe("BetterPlansScreen", () => {
  it("does not reach the offer feed until asked", async () => {
    const server = startUtilityServer();
    await show(<BetterPlansScreen />);
    expect(await screen.findByText(UTILITY_OFFER_MESSAGES.idle)).toBeTruthy();
    expect(server.requests.some((request) => request.url === "/utility-plans/offers")).toBe(false);
  });

  it("shows a skeleton while checking the market", async () => {
    startUtilityServer({ offers: "hold" });
    await show(<BetterPlansScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: UTILITY_OFFER_MESSAGES.check }));
    expect(await screen.findByTestId("better-plans-skeleton")).toBeTruthy();
  });

  it("shows the current plan, the best offer with its saving, and where to sign up", async () => {
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    startUtilityServer({ offers: { groups: [aUtilityOfferGroup()], reference_annual_kwh: 12_000, has_any_offers: true } });
    await show(<BetterPlansScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: UTILITY_OFFER_MESSAGES.check }));
    await screen.findByText("Oak Street");
    expect(screen.getByText("Reliant")).toBeTruthy();
    expect(screen.getByText("16.28¢/kWh")).toBeTruthy();
    expect(screen.getByText(UTILITY_OFFER_MESSAGES.bestValue.toUpperCase())).toBeTruthy();
    expect(screen.getByText("Big upgrade")).toBeTruthy();
    expect(screen.getByLabelText(/\$619.*less per year than now/)).toBeTruthy();
    expect(screen.getByText(UTILITY_OFFER_MESSAGES.basis("12,000"))).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: UTILITY_OFFER_MESSAGES.signUp("Octopus") }));
    expect(openURL).toHaveBeenCalledWith("https://example.test/enroll");
  });

  it("says a cost to leave that was never recorded is not free", async () => {
    startUtilityServer({ offers: { groups: [aUtilityOfferGroup({ switch_cost_cents: null })], reference_annual_kwh: 12_000, has_any_offers: true } });
    await show(<BetterPlansScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: UTILITY_OFFER_MESSAGES.check }));
    await screen.findByText(UTILITY_OFFER_MESSAGES.noExitFee);
    expect(screen.getByText(UTILITY_OFFER_MESSAGES.notRecorded)).toBeTruthy();
  });

  it("warns that a teaser rate only holds near 1,000 kWh", async () => {
    startUtilityServer({ offers: { groups: [aUtilityOfferGroup({ offers: [aUtilityOffer({ is_teaser_priced: true })] })], reference_annual_kwh: 12_000, has_any_offers: true } });
    await show(<BetterPlansScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: UTILITY_OFFER_MESSAGES.check }));
    await screen.findByText(UTILITY_OFFER_MESSAGES.teaser);
    expect(screen.getByText("Conditional")).toBeTruthy();
  });

  it("puts the property with the most to save first", async () => {
    startUtilityServer({
      offers: {
        groups: [
          aUtilityOfferGroup({ property_id: "a", property_name: "Small saver", offers: [aUtilityOffer({ annual_saving_cents: 5_000 })] }),
          aUtilityOfferGroup({ property_id: "b", property_name: "Big saver", offers: [aUtilityOffer({ annual_saving_cents: 90_000 })] }),
        ],
        reference_annual_kwh: 12_000,
        has_any_offers: true,
      },
    });
    await show(<BetterPlansScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: UTILITY_OFFER_MESSAGES.check }));
    await screen.findByText("Big saver");
    const names = screen.getAllByRole("header").map((header) => header.props.children).filter((text) => text === "Big saver" || text === "Small saver");
    expect(names).toEqual(["Big saver", "Small saver"]);
  });

  it("folds providers at the same rate into one card and says what was held back", async () => {
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    startUtilityServer({
      offers: {
        groups: [
          aUtilityOfferGroup({
            offers: [aUtilityOffer(), aUtilityOffer({ external_plan_id: 2, provider_name: "Rhythm", cancellation_fee_cents: 20_000, enroll_url: "https://example.test/rhythm" })],
            withheld_low_rated_count: 3,
          }),
        ],
        reference_annual_kwh: 12_000,
        has_any_offers: true,
      },
    });
    await show(<BetterPlansScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: UTILITY_OFFER_MESSAGES.check }));
    await screen.findByText(UTILITY_OFFER_MESSAGES.withheld(3));
    expect(screen.getAllByText(UTILITY_OFFER_MESSAGES.bestValue.toUpperCase())).toHaveLength(1);
    await fireEvent.press(screen.getByRole("button", { name: UTILITY_OFFER_MESSAGES.others(1) }));
    await fireEvent.press(await screen.findByRole("button", { name: UTILITY_OFFER_MESSAGES.alternateSignUp("Rhythm") }));
    expect(openURL).toHaveBeenCalledWith("https://example.test/rhythm");
  });

  it("shows the price detail and facts label when opened", async () => {
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    startUtilityServer({ offers: { groups: [aUtilityOfferGroup()], reference_annual_kwh: 12_000, has_any_offers: true } });
    await show(<BetterPlansScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: UTILITY_OFFER_MESSAGES.check }));
    await fireEvent.press(await screen.findByRole("button", { name: UTILITY_OFFER_MESSAGES.priceDetail }));
    expect(screen.getByText(UTILITY_OFFER_MESSAGES.priceAt("11.50¢", "10.50¢", "10.90¢"))).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: UTILITY_OFFER_MESSAGES.factsLabel }));
    expect(openURL).toHaveBeenCalledWith("https://example.test/efl.pdf");
  });

  it("lists time-of-use plans apart, with their terms and no saving", async () => {
    startUtilityServer({
      offers: {
        groups: [
          aUtilityOfferGroup({
            offers: [],
            time_of_use_offers: [aUtilityOffer({ external_plan_id: 9, provider_name: "Night Owl", is_time_of_use: true, special_terms: "Free power 9pm to 6am", annual_saving_cents: null })],
            withheld_low_rated_time_of_use_count: 2,
          }),
        ],
        reference_annual_kwh: 12_000,
        has_any_offers: true,
      },
    });
    await show(<BetterPlansScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: UTILITY_OFFER_MESSAGES.check }));
    await screen.findByText(UTILITY_OFFER_MESSAGES.touHeading);
    expect(screen.getByText("Free power 9pm to 6am")).toBeTruthy();
    expect(screen.getByText(UTILITY_OFFER_MESSAGES.touWithheld(2))).toBeTruthy();
    expect(screen.queryByText(UTILITY_OFFER_MESSAGES.bestValue.toUpperCase())).toBeNull();
    expect(screen.queryByText(/less per year/)).toBeNull();
  });

  it("names the reason when a property has nothing to show", async () => {
    startUtilityServer({ offers: { groups: [aUtilityOfferGroup({ offers: [], unavailable_reason: "No ZIP code on this property." })], reference_annual_kwh: 12_000, has_any_offers: false } });
    await show(<BetterPlansScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: UTILITY_OFFER_MESSAGES.check }));
    expect(await screen.findByText("No ZIP code on this property.")).toBeTruthy();
  });

  it("says the feed couldn't be reached, and checks again", async () => {
    const server = startUtilityServer({ offers: "fail" });
    await show(<BetterPlansScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: UTILITY_OFFER_MESSAGES.check }));
    await screen.findByText(UTILITY_OFFER_MESSAGES.error);
    server.offers = { groups: [aUtilityOfferGroup()], reference_annual_kwh: 12_000, has_any_offers: true };
    await fireEvent.press(screen.getByRole("button", { name: UTILITY_OFFER_MESSAGES.checkAgain }));
    await screen.findByText("Oak Street");
  });

  it("invites a writer with no plans to add one, and a viewer to nothing", async () => {
    startUtilityServer({});
    await show(<BetterPlansScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: UTILITY_OFFER_MESSAGES.check }));
    await fireEvent.press(await screen.findByRole("button", { name: UTILITY_OFFER_MESSAGES.addPlan }));
    expect(mockPush).toHaveBeenCalledWith("/utility-plans/new");
  });

  it("gives a viewer with no plans nothing to add", async () => {
    startUtilityServer({ role: "viewer" });
    await show(<BetterPlansScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: UTILITY_OFFER_MESSAGES.check }));
    await screen.findByText(UTILITY_OFFER_MESSAGES.empty);
    expect(screen.queryByRole("button", { name: UTILITY_OFFER_MESSAGES.addPlan })).toBeNull();
  });
});
