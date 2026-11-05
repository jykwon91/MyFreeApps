import { utilityPlansApi } from "@mybookkeeper/api-client/store/utilityPlansApi";
import type { UtilityPlanDetail } from "@mybookkeeper/api-client/types/utility/utility-plan-detail";
import type { UtilityPlanSummary } from "@mybookkeeper/api-client/types/utility/utility-plan-summary";
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { AxiosAdapter } from "axios";
import type { ReactElement } from "react";
import { AppState, type AppStateStatus, Linking } from "react-native";
import { Provider } from "react-redux";
import { WEB_BASE_URL } from "../src/constants/api";
import { SHOWING_LAST_LOADED_MESSAGE } from "../src/constants/offline";
import { UTILITY_PLAN_MESSAGES } from "../src/constants/utilityPlans";
import { planChip, planFacts, planTermNote, sortedPlans } from "../src/features/utilityPlans/utilityPlanDisplay";
import UtilityPlanDetailScreen from "../src/features/utilityPlans/UtilityPlanDetailScreen";
import UtilityPlansScreen from "../src/features/utilityPlans/UtilityPlansScreen";
import { store } from "../src/lib/store";

const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock("expo-router", () => ({
  useFocusEffect: () => undefined,
  router: { push: (path: string) => mockPush(path), back: () => mockBack() },
}));

const originalAdapter = api.defaults.adapter;

function aSummary(overrides: Partial<UtilityPlanSummary> = {}): UtilityPlanSummary {
  return {
    id: "u1",
    property_id: "pr1",
    property_name: "Oak Street",
    service_type: "electricity",
    provider_name: "Reliant",
    plan_name: "Secure 12",
    rate_type: "fixed",
    avg_price_cents_per_kwh_at_1000: "13.9000",
    term_end_date: "2099-06-30",
    days_until_term_end: 9000,
    renewal_status: "active",
    is_current: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function aPlan(overrides: Partial<UtilityPlanDetail> = {}): UtilityPlanDetail {
  return {
    ...aSummary(),
    user_id: "o",
    organization_id: "o",
    account_number: "1234564944",
    energy_charge_cents_per_kwh: "8.5000",
    tdu_charge_cents_per_kwh: "5.3509",
    monthly_base_charge_cents: 495,
    term_months: 12,
    service_start_date: "2026-01-15",
    early_termination_fee_cents: 15_000,
    has_bill_credit: true,
    bill_credit_amount_cents: 10_000,
    bill_credit_threshold_kwh: 1000,
    min_usage_fee_cents: 995,
    min_usage_threshold_kwh: 500,
    post_promo_monthly_cents: null,
    equipment_fee_monthly_cents: null,
    download_mbps: null,
    upload_mbps: null,
    data_cap_gb: null,
    source_document_id: null,
    notes: "Autopay on",
    ...overrides,
  };
}

const NOTHING_RECORDED: Partial<UtilityPlanDetail> = {
  account_number: null,
  energy_charge_cents_per_kwh: null,
  tdu_charge_cents_per_kwh: null,
  avg_price_cents_per_kwh_at_1000: null,
  monthly_base_charge_cents: null,
  term_months: null,
  service_start_date: null,
  term_end_date: null,
  early_termination_fee_cents: null,
  has_bill_credit: false,
  bill_credit_amount_cents: null,
  bill_credit_threshold_kwh: null,
  min_usage_fee_cents: null,
  min_usage_threshold_kwh: null,
  notes: null,
};

function startServer(list: unknown, detail: unknown = aPlan()) {
  const server = { list, detail };
  const adapter: AxiosAdapter = async (config) => {
    const answer = config.url === "/utility-plans" ? server.list : server.detail;
    if (answer === "hold") return new Promise(() => undefined);
    if (answer === "fail") return Promise.reject({ response: { status: 500, data: {} }, config, isAxiosError: true });
    if (answer === "gone") return Promise.reject({ response: { status: 404, data: {} }, config, isAxiosError: true });
    return { data: answer, status: 200, statusText: "OK", headers: {}, config };
  };
  api.defaults.adapter = adapter;
  return server;
}

function aPage(items: UtilityPlanSummary[], hasMore = false) {
  return { items, total: items.length, has_more: hasMore };
}

async function show(element: ReactElement) {
  await render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>{element}</ToastProvider>
    </Provider>,
  );
}

beforeEach(() => {
  store.dispatch(baseApi.util.resetApiState());
  mockPush.mockClear();
  mockBack.mockClear();
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
  jest.restoreAllMocks();
});

describe("planChip", () => {
  const today = "2026-03-10";
  it("counts from the phone's date, not the server's", () => {
    expect(planChip(aSummary({ term_end_date: "2026-03-19", days_until_term_end: 10 }), today)).toBe("Ends in 9 days");
    expect(planChip(aSummary({ renewal_status: "expired", term_end_date: "2026-03-10", days_until_term_end: -1 }), today)).toBe("Ends today");
    expect(planChip(aSummary({ renewal_status: "expiring_soon", term_end_date: "2026-03-09", days_until_term_end: 0 }), today)).toBe("Lapsed 1 day ago");
  });

  it("warns as soon as the window opens, even on an answer loaded before it did", () => {
    expect(planChip(aSummary({ renewal_status: "active", term_end_date: "2026-04-24" }), today)).toBe("Ends in 45 days");
    expect(planChip(aSummary({ renewal_status: "active", term_end_date: "2026-04-25" }), today)).toBeNull();
  });

  it("stays quiet on a plan with nothing to act on", () => {
    expect(planChip(aSummary({ term_end_date: "2099-06-30" }), today)).toBeNull();
    expect(planChip(aSummary({ term_end_date: null }), today)).toBeNull();
    expect(planChip(aSummary({ rate_type: "regulated", term_end_date: "2026-03-01" }), today)).toBeNull();
  });

  it("never calls a past plan lapsed", () => {
    expect(planChip(aSummary({ is_current: false, renewal_status: "expired", term_end_date: "2025-01-01" }), today)).toBe("Past plan");
  });
});

describe("sortedPlans", () => {
  it("puts what needs attention first and past plans last", () => {
    const sorted = sortedPlans([
      aSummary({ id: "past", is_current: false, term_end_date: "2020-01-01" }),
      aSummary({ id: "none", term_end_date: null }),
      aSummary({ id: "active", term_end_date: "2027-01-01" }),
      aSummary({ id: "later", term_end_date: "2026-04-20" }),
      aSummary({ id: "soon", term_end_date: "2026-04-01" }),
      aSummary({ id: "lapsed", term_end_date: "2026-01-01" }),
    ], "2026-03-10");
    expect(sorted.map((plan) => plan.id)).toEqual(["lapsed", "soon", "later", "active", "none", "past"]);
  });

  it("sorts by the same date the chip counts from", () => {
    const sorted = sortedPlans([
      aSummary({ id: "today", renewal_status: "expired", term_end_date: "2026-03-10" }),
      aSummary({ id: "lapsed", renewal_status: "expiring_soon", term_end_date: "2026-03-09" }),
    ], "2026-03-10");
    expect(sorted.map((plan) => plan.id)).toEqual(["lapsed", "today"]);
  });
});

describe("planTermNote", () => {
  it("only says there's no term when that's true", () => {
    expect(planTermNote(aSummary({ rate_type: "regulated", term_end_date: null }))).toBe(UTILITY_PLAN_MESSAGES.noFixedTerm);
    expect(planTermNote(aSummary({ term_end_date: null }))).toBe("No term end recorded");
  });

  it("stays out of the way when the date is there or the plan is over", () => {
    expect(planTermNote(aSummary({ rate_type: "regulated", term_end_date: "2027-06-30" }))).toBeNull();
    expect(planTermNote(aSummary({ is_current: false, term_end_date: null }))).toBeNull();
  });
});

describe("planFacts", () => {
  const value = (plan: UtilityPlanDetail, label: string) => planFacts(plan).find((fact) => fact.label === label)?.value;

  it("keeps rates in cents per kWh and flat amounts in dollars", () => {
    const plan = aPlan();
    expect(value(plan, UTILITY_PLAN_MESSAGES.averageAt1000)).toBe("13.9¢/kWh");
    expect(value(plan, UTILITY_PLAN_MESSAGES.deliveryCharge)).toBe("5.3509¢/kWh");
    expect(value(plan, UTILITY_PLAN_MESSAGES.baseCharge)).toBe("$4.95");
    expect(value(plan, UTILITY_PLAN_MESSAGES.earlyTerminationFee)).toBe("$150.00");
    expect(value(plan, UTILITY_PLAN_MESSAGES.billCredit)).toBe("$100.00 at 1,000 kWh");
    expect(value(plan, UTILITY_PLAN_MESSAGES.minimumUsageFee)).toBe("$9.95 under 500 kWh");
  });

  it("gives internet its own facts", () => {
    const plan = aPlan({
      ...NOTHING_RECORDED,
      service_type: "internet",
      post_promo_monthly_cents: 7999,
      equipment_fee_monthly_cents: 1500,
      download_mbps: 500,
      upload_mbps: 20,
      data_cap_gb: 1200,
    });
    expect(planFacts(plan)).toEqual([
      { label: UTILITY_PLAN_MESSAGES.afterPromo, value: "$79.99/mo" },
      { label: UTILITY_PLAN_MESSAGES.equipmentFee, value: "$15.00/mo" },
      { label: UTILITY_PLAN_MESSAGES.download, value: "500 Mbps" },
      { label: UTILITY_PLAN_MESSAGES.upload, value: "20 Mbps" },
      { label: UTILITY_PLAN_MESSAGES.dataCap, value: "1200 GB" },
    ]);
  });

  it("shows a real zero, and a bill credit only when the plan has one", () => {
    const plan = aPlan({ early_termination_fee_cents: 0, has_bill_credit: false });
    expect(value(plan, UTILITY_PLAN_MESSAGES.earlyTerminationFee)).toBe("$0.00");
    expect(value(plan, UTILITY_PLAN_MESSAGES.billCredit)).toBeUndefined();
  });

  it("is empty when nothing is recorded", () => {
    expect(planFacts(aPlan(NOTHING_RECORDED))).toEqual([]);
  });
});

describe("UtilityPlansScreen", () => {
  it("shows a skeleton while the first answer is on its way", async () => {
    startServer("hold");
    await show(<UtilityPlansScreen />);
    expect(await screen.findByTestId("utility-plans-skeleton")).toBeTruthy();
  });

  it("opens a plan, and never shows an account number", async () => {
    startServer(aPage([aSummary()]));
    await show(<UtilityPlansScreen />);
    await screen.findByText("Oak Street · Electricity");
    expect(screen.getByText("Reliant · Secure 12")).toBeTruthy();
    expect(screen.getByText("Fixed · 13.9¢/kWh at 1,000 kWh")).toBeTruthy();
    expect(screen.queryByText(/4944/)).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Oak Street · Electricity, Reliant · Secure 12, Fixed · 13.9¢/kWh at 1,000 kWh" }));
    expect(mockPush).toHaveBeenCalledWith("/utility-plans/u1");
  });

  it("says when there are more than it shows", async () => {
    startServer(aPage([aSummary()], true));
    await show(<UtilityPlansScreen />);
    await screen.findByText(UTILITY_PLAN_MESSAGES.moreOnWebsite);
  });

  it("points to the website when there are none", async () => {
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    startServer(aPage([]));
    await show(<UtilityPlansScreen />);
    await screen.findByText(UTILITY_PLAN_MESSAGES.noneHeading);
    await fireEvent.press(screen.getByRole("button", { name: "Open on the website" }));
    expect(openURL).toHaveBeenCalledWith(`${WEB_BASE_URL}/utility-plans`);
  });

  it("offers a retry when the first load fails, and recovers", async () => {
    const server = startServer("fail");
    await show(<UtilityPlansScreen />);
    await screen.findByText(UTILITY_PLAN_MESSAGES.couldntLoadList);
    expect(screen.queryByText(UTILITY_PLAN_MESSAGES.noneHeading)).toBeNull();
    server.list = aPage([aSummary()]);
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    await screen.findByText("Oak Street · Electricity");
  });

  it("keeps what it had and says so when a pull to refresh fails", async () => {
    const server = startServer(aPage([aSummary()]));
    await show(<UtilityPlansScreen />);
    await screen.findByText("Oak Street · Electricity");
    server.list = "fail";
    await act(async () => {
      await screen.getByTestId("utility-plans-list").props.refreshControl.props.onRefresh();
    });
    await screen.findByText(SHOWING_LAST_LOADED_MESSAGE);
    expect(screen.getByText("Oak Street · Electricity")).toBeTruthy();
  });
});

describe("UtilityPlanDetailScreen", () => {
  it("shows a skeleton while the first answer is on its way", async () => {
    startServer(aPage([]), "hold");
    await show(<UtilityPlanDetailScreen id="u1" />);
    expect(await screen.findByTestId("utility-plan-detail-skeleton")).toBeTruthy();
  });

  it("shows the plan, with the account number hidden until asked", async () => {
    startServer(aPage([]));
    await show(<UtilityPlanDetailScreen id="u1" />);
    await screen.findByText("Oak Street · Electricity");
    for (const text of ["Jun 30, 2099", "1 year", "$150.00", "Autopay on", "•••• 4944"]) {
      expect(screen.getByText(text)).toBeTruthy();
    }
    expect(screen.queryByText("1234564944")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Show the full account number" }));
    expect(screen.getByText("1234564944")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Hide the full account number" }));
    expect(screen.queryByText("1234564944")).toBeNull();
  });

  it("hides the account number again on leaving the app", async () => {
    const listeners: ((state: AppStateStatus) => void)[] = [];
    jest.spyOn(AppState, "addEventListener").mockImplementation((_type, listener) => {
      listeners.push(listener);
      return { remove: jest.fn() };
    });
    startServer(aPage([]));
    await show(<UtilityPlanDetailScreen id="u1" />);
    await screen.findByText("•••• 4944");
    await fireEvent.press(screen.getByRole("button", { name: "Show the full account number" }));
    expect(screen.getByText("1234564944")).toBeTruthy();
    await act(async () => {
      listeners.forEach((listener) => listener("inactive"));
    });
    expect(screen.queryByText("1234564944")).toBeNull();
    expect(screen.getByText("•••• 4944")).toBeTruthy();
  });

  it("says a regulated plan has no fixed term instead of calling it expired", async () => {
    startServer(aPage([]), aPlan({ ...NOTHING_RECORDED, rate_type: "regulated", renewal_status: "not_applicable", days_until_term_end: null }));
    await show(<UtilityPlanDetailScreen id="u1" />);
    await screen.findByText(UTILITY_PLAN_MESSAGES.noFixedTerm);
    expect(screen.queryByText(/Lapsed|Expired/)).toBeNull();
    expect(screen.queryByText(UTILITY_PLAN_MESSAGES.accountNumber)).toBeNull();
    expect(screen.queryByText(UTILITY_PLAN_MESSAGES.notes)).toBeNull();
  });

  it("says when the plan is gone, and offers a way back", async () => {
    startServer(aPage([]), "gone");
    await show(<UtilityPlanDetailScreen id="u1" />);
    await screen.findByText(UTILITY_PLAN_MESSAGES.cantFind);
    await fireEvent.press(screen.getByRole("button", { name: "Back" }));
    expect(mockBack).toHaveBeenCalled();
  });

  it("offers a retry when it couldn't load, and recovers", async () => {
    const server = startServer(aPage([]), "fail");
    await show(<UtilityPlanDetailScreen id="u1" />);
    await screen.findByText(UTILITY_PLAN_MESSAGES.couldntLoadOne);
    server.detail = aPlan();
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    await screen.findByText("Oak Street · Electricity");
  });

  it("keeps what it had when a reload fails", async () => {
    const server = startServer(aPage([]));
    await show(<UtilityPlanDetailScreen id="u1" />);
    await screen.findByText("Oak Street · Electricity");
    server.detail = "fail";
    await act(async () => {
      await store.dispatch(utilityPlansApi.endpoints.getUtilityPlanById.initiate("u1", { forceRefetch: true }));
    });
    await screen.findByText(SHOWING_LAST_LOADED_MESSAGE);
    expect(screen.getByText("Oak Street · Electricity")).toBeTruthy();
  });
});
