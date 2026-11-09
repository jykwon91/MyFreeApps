import type { UtilityTrendPoint } from "@mybookkeeper/api-client/types/analytics/utility-trend-point";
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { AxiosAdapter, AxiosRequestConfig } from "axios";
import { Provider } from "react-redux";
import { UTILITY_COSTS_MESSAGES as MESSAGES } from "../src/constants/analytics";
import { MONEY_ANALYSIS_MESSAGES as ANALYSIS } from "../src/constants/moneyAnalysis";
import { SHOWING_LAST_LOADED_MESSAGE } from "../src/constants/offline";
import { barPercent, totalCents, utilityLabel, utilityRows } from "../src/features/analytics/utilityCostsDisplay";
import { isCurrentPeriod, periodBounds, periodRows, spanOf } from "../src/features/analytics/utilityPeriods";
import UtilityCostsScreen from "../src/features/analytics/UtilityCostsScreen";
import { useCanWrite } from "../src/features/workspace/useCanWrite";
import { store } from "../src/lib/store";
import { useToday } from "../src/lib/useToday";

const mockPush = jest.fn();
const mockNavigate = jest.fn();
jest.mock("expo-router", () => ({
  useFocusEffect: () => undefined,
  router: { push: (path: string) => mockPush(path), navigate: (path: string) => mockNavigate(path) },
}));
jest.mock("../src/features/workspace/useCanWrite", () => ({ useCanWrite: jest.fn() }));
jest.mock("../src/lib/useToday", () => ({ useToday: jest.fn() }));
jest.mock("react-native/Libraries/Modal/Modal", () => ({
  __esModule: true,
  default: ({ visible, children }: { visible: boolean; children: unknown }) => (visible ? children : null),
}));

const originalAdapter = api.defaults.adapter;
const NOW = new Date();
const THIS_PERIOD = `${NOW.getFullYear()}-${String(NOW.getMonth() + 1).padStart(2, "0")}`;

function aPoint(overrides: Partial<UtilityTrendPoint> = {}): UtilityTrendPoint {
  return { period: THIS_PERIOD, property_id: "p1", property_name: "Elm St", sub_category: "water", total: 40.1, ...overrides };
}

interface Server {
  trends: UtilityTrendPoint[];
  reads: Record<string, unknown>[];
  dead: boolean;
  never: boolean;
  status?: number;
  propertiesStatus?: number;
  /** What to answer a read with, by what it asked for; the plain list when unset. */
  answer?: (params: Record<string, unknown>) => UtilityTrendPoint[];
  failFor?: (params: Record<string, unknown>) => boolean;
}

function serve(trends: UtilityTrendPoint[], properties = [{ id: "p1", name: "Elm St" }, { id: "p2", name: "Oak Ave" }]): Server {
  const server: Server = { trends, reads: [], dead: false, never: false };
  const adapter: AxiosAdapter = async (config: AxiosRequestConfig & { url?: string }) => {
    const respond = (status: number, data: unknown) => {
      const response = { data, status, statusText: "", headers: {}, config } as never;
      if (status >= 400) throw Object.assign(new Error("refused"), { isAxiosError: true, response, config });
      return response;
    };
    if (config.url === "/properties") return server.propertiesStatus ? respond(server.propertiesStatus, {}) : respond(200, properties);
    if (config.url === "/summary/years") return respond(200, [NOW.getFullYear(), NOW.getFullYear() - 1]);
    if (server.never) return new Promise(() => undefined);
    if (server.dead) throw Object.assign(new Error("Network Error"), { isAxiosError: true, config });
    server.reads.push(config.params as Record<string, unknown>);
    if (server.status || server.failFor?.(config.params as Record<string, unknown>)) return respond(server.status ?? 500, {});
    return respond(200, { trends: server.answer ? server.answer(config.params as Record<string, unknown>) : server.trends, summary: {}, total_spend: 0 });
  };
  api.defaults.adapter = adapter;
  return server;
}

function tree() {
  return (
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>
        <UtilityCostsScreen />
      </ToastProvider>
    </Provider>
  );
}

async function show(): Promise<void> {
  await render(tree());
}

async function choosePeriod(label: string): Promise<void> {
  await fireEvent.press(screen.getByRole("button", { name: /^Period,/ }));
  await fireEvent.press(await screen.findByText(label));
  await fireEvent.press(screen.getByRole("button", { name: ANALYSIS.showResults }));
}

async function chooseCompare(label: string): Promise<void> {
  await fireEvent.press(screen.getByRole("button", { name: /^Compare with,/ }));
  await fireEvent.press(await screen.findByText(label));
}

beforeEach(() => {
  mockNavigate.mockReset();
  store.dispatch(baseApi.util.resetApiState());
  mockPush.mockReset();
  jest.mocked(useCanWrite).mockReturnValue(true);
  jest.mocked(useToday).mockReturnValue(NOW);
});

afterAll(() => {
  api.defaults.adapter = originalAdapter;
});

describe("utilityCostsDisplay", () => {
  it("adds up in cents, so rows and total agree where floats would drift", () => {
    const rows = utilityRows([aPoint({ total: 0.1 }), aPoint({ period: "2026-01", total: 0.2 }), aPoint({ sub_category: "gas", total: 5 })]);
    expect(rows.map((row) => [row.subCategory, row.cents])).toEqual([["gas", 500], ["water", 30]]);
    expect(totalCents(rows)).toBe(530);
  });

  it("names a utility it has no label for instead of dropping it", () => {
    expect(utilityLabel("solar_credit")).toBe("Solar credit");
    expect(utilityRows([aPoint({ sub_category: "solar_credit" })])[0].label).toBe("Solar credit");
  });

  it("fills months with no bills, newest first, across a year boundary", () => {
    const months = periodRows([aPoint({ period: "2025-12", total: 10 }), aPoint({ period: "2026-02", total: 20 })], { startDate: "2025-12-01", endDate: "2026-02-15" }, "monthly");
    expect(months.map((month) => [month.period, month.cents])).toEqual([["2026-02", 2000], ["2026-01", 0], ["2025-12", 1000]]);
  });

  it("groups by quarter, across a year boundary, with empty quarters kept", () => {
    const quarters = periodRows([aPoint({ period: "2025-Q4", total: 10 }), aPoint({ period: "2026-Q2", total: 20 })], { startDate: "2025-11-01", endDate: "2026-05-20" }, "quarterly");
    expect(quarters.map((quarter) => [quarter.period, quarter.cents])).toEqual([["2026-Q2", 2000], ["2026-Q1", 0], ["2025-Q4", 1000]]);
  });

  it("knows the days a month or a quarter covers", () => {
    expect(periodBounds("2026-02")).toEqual({ startDate: "2026-02-01", endDate: "2026-02-28" });
    expect(periodBounds("2026-Q4")).toEqual({ startDate: "2026-10-01", endDate: "2026-12-31" });
  });

  it("marks only the period holding today as still growing", () => {
    const today = new Date(2026, 4, 20);
    expect(isCurrentPeriod("2026-05", today)).toBe(true);
    expect(isCurrentPeriod("2026-04", today)).toBe(false);
    expect(isCurrentPeriod("2026-Q2", today)).toBe(true);
    expect(isCurrentPeriod("2026-Q1", today)).toBe(false);
  });

  it("spans all time from the first bill to today, and has nothing to span without bills", () => {
    expect(spanOf(null, [aPoint({ period: "2025-Q3" }), aPoint({ period: "2026-01" })], new Date(2026, 4, 20))).toEqual({ startDate: "2025-07-01", endDate: "2026-05-20" });
    expect(spanOf(null, [], new Date(2026, 4, 20))).toBeNull();
    expect(spanOf({ startDate: "2026-01-01", endDate: "2026-02-01" }, [], new Date(2026, 4, 20))).toEqual({ startDate: "2026-01-01", endDate: "2026-02-01" });
  });

  it("keeps a small bar visible and an empty one empty", () => {
    expect(barPercent(1, 100000)).toBe(2);
    expect(barPercent(0, 100000)).toBe(0);
    expect(barPercent(50, 100)).toBe(50);
  });
});

describe("UtilityCostsScreen", () => {
  it("shows the total, each utility, and the partial current month", async () => {
    serve([aPoint({ total: 40.1 }), aPoint({ sub_category: "electricity", total: 100 })]);
    await show();
    expect(await screen.findByText("I've seen $140.10 in utilities")).toBeTruthy();
    expect(screen.getByText(MESSAGES.approvedOnly)).toBeTruthy();
    expect(screen.getByText("Electricity")).toBeTruthy();
    expect(screen.getByText("Water")).toBeTruthy();
    expect(screen.getByText(/so far/)).toBeTruthy();
  });

  it("opens a month to show what made it up, and closes it again", async () => {
    serve([aPoint({ total: 40.1 }), aPoint({ sub_category: "electricity", total: 100 })]);
    await show();
    const month = await screen.findByRole("button", { name: /so far/ });
    expect(screen.getAllByText("$40.10")).toHaveLength(1);
    await fireEvent.press(month);
    expect(screen.getAllByText("$40.10")).toHaveLength(2);
    await fireEvent.press(month);
    expect(screen.getAllByText("$40.10")).toHaveLength(1);
  });

  it("asks for the chosen range and only that property", async () => {
    const server = serve([aPoint()]);
    await show();
    await screen.findByText(/I've seen/);
    expect(server.reads[0]).toMatchObject({ granularity: "monthly", end_date: expect.any(String) });
    expect(server.reads[0].property_ids).toBeUndefined();

    await choosePeriod("Last year");
    await waitFor(() => expect(server.reads.at(-1)?.start_date).toBe(`${NOW.getFullYear() - 1}-01-01`));
    await screen.findByText(/I've seen/);

    await fireEvent.press(screen.getByRole("button", { name: `${ANALYSIS.properties}, ${ANALYSIS.allProperties}` }));
    await fireEvent.press(await screen.findByText("Oak Ave"));
    await fireEvent.press(await screen.findByText("Elm St"));
    await waitFor(() => expect(server.reads.at(-1)?.property_ids).toBe("p2,p1"));
  });

  it("reads a hand-picked range, and all time with no dates at all", async () => {
    const server = serve([aPoint()]);
    await show();
    await screen.findByText(/I've seen/);
    await fireEvent.press(screen.getByRole("button", { name: /^Period,/ }));
    await fireEvent.press(await screen.findByText(ANALYSIS.customRange));
    await fireEvent.press(screen.getByRole("button", { name: ANALYSIS.showResults }));
    const day = `${NOW.getFullYear()}-${String(NOW.getMonth() + 1).padStart(2, "0")}-${String(NOW.getDate()).padStart(2, "0")}`;
    await waitFor(() => expect(server.reads.at(-1)).toMatchObject({ start_date: "2025-12-01", end_date: day }));
    await screen.findByText(/I've seen/);
    await choosePeriod("All time");
    await waitFor(() => expect(server.reads.at(-1)?.start_date).toBeUndefined());
    expect(server.reads.at(-1)?.end_date).toBeUndefined();
  });

  it("groups by quarter when asked, with quarters as the rows", async () => {
    const server = serve([aPoint({ period: `${NOW.getFullYear()}-Q${Math.floor(NOW.getMonth() / 3) + 1}`, total: 90 })]);
    await show();
    await screen.findByText(/I've seen/);
    await fireEvent.press(screen.getByRole("tab", { name: "By quarter" }));
    await waitFor(() => expect(server.reads.at(-1)?.granularity).toBe("quarterly"));
    expect(await screen.findByText(new RegExp(`Q${Math.floor(NOW.getMonth() / 3) + 1} ${NOW.getFullYear()}`))).toBeTruthy();
    expect(screen.getAllByText("By quarter")).toHaveLength(2);
  });

  it("sets the costs against the same dates last year, with the move in dollars and percent", async () => {
    const server = serve([]);
    server.answer = (params) => (params.start_date === `${NOW.getFullYear() - 2}-01-01` ? [aPoint({ period: `${NOW.getFullYear() - 2}-06`, total: 100 })] : [aPoint({ total: 150 })]);
    await show();
    await screen.findByText(/I've seen/);
    await choosePeriod("Last year");
    await screen.findByText(/I've seen/);
    await chooseCompare("The same dates last year");
    await waitFor(() => expect(server.reads.some((read) => read.start_date === `${NOW.getFullYear() - 2}-01-01`)).toBe(true));
    expect((await screen.findAllByTestId("change-note")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("+$50.00 (+50%) · Before: $100.00")).toHaveLength(2);
  });

  it("shows zero before as having nothing to compare with, never a percentage", async () => {
    const server = serve([]);
    server.answer = (params) => (String(params.start_date) < `${NOW.getFullYear() - 1}-06-01` ? [] : [aPoint({ total: 150 })]);
    await show();
    await screen.findByText(/I've seen/);
    await chooseCompare("The same dates last year");
    expect((await screen.findAllByTestId("change-note")).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/nothing to compare with before/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Infinity|NaN/)).toBeNull();
  });

  it("says when the earlier stretch won't load and can try it again", async () => {
    const server = serve([aPoint()]);
    await show();
    await screen.findByText(/I've seen/);
    server.failFor = (params) => String(params.start_date) < `${NOW.getFullYear() - 1}-06-01`;
    await chooseCompare("The same dates last year");
    expect(await screen.findByText(MESSAGES.comparisonFailed)).toBeTruthy();
    expect(screen.getByText(/I've seen/)).toBeTruthy();
    server.failFor = undefined;
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.retryComparison }));
    await waitFor(() => expect(screen.queryByText(MESSAGES.comparisonFailed)).toBeNull());
  });

  it("opens the approved utility bills behind the total, and behind one month", async () => {
    serve([aPoint()]);
    await show();
    await screen.findByText(/I've seen/);
    await fireEvent.press(screen.getByRole("button", { name: new RegExp(MESSAGES.seeBills) }));
    expect(mockNavigate).toHaveBeenLastCalledWith(expect.stringContaining("category=utilities"));
    await fireEvent.press(screen.getByRole("button", { name: /so far/ }));
    await fireEvent.press(screen.getByRole("button", { name: /^Bills for/ }));
    const link = String(mockNavigate.mock.calls.at(-1)?.[0]);
    expect(link).toContain("category=utilities");
    expect(link).toContain(`from=${THIS_PERIOD}-01`);
  });

  it("hides the property choice when there's only one property", async () => {
    serve([aPoint()], [{ id: "p1", name: "Elm St" }]);
    await show();
    await screen.findByText(/I've seen/);
    expect(screen.queryByRole("button", { name: /^Properties,/ })).toBeNull();
  });

  it("offers a photo when there are no bills", async () => {
    serve([]);
    await show();
    expect(await screen.findByText(MESSAGES.noneHeading)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.takePhoto }));
    expect(mockPush).toHaveBeenCalledWith("/camera");
  });

  it("doesn't offer a viewer a way to add", async () => {
    jest.mocked(useCanWrite).mockReturnValue(false);
    serve([]);
    await show();
    expect(await screen.findByText(MESSAGES.noneBodyViewer)).toBeTruthy();
    expect(screen.queryByRole("button", { name: MESSAGES.takePhoto })).toBeNull();
  });

  it("leads back to the default view when a range is empty", async () => {
    const server = serve([]);
    await show();
    await screen.findByText(MESSAGES.noneHeading);
    await choosePeriod("Last year");
    await fireEvent.press(await screen.findByRole("button", { name: MESSAGES.showDefault }));
    expect(await screen.findByText(MESSAGES.noneHeading)).toBeTruthy();
    expect(server.reads.at(-1)?.property_ids).toBeUndefined();
  });

  it("never reads a failure as having no bills, and can retry", async () => {
    const server = serve([aPoint()]);
    server.status = 429;
    await show();
    expect(await screen.findByText(MESSAGES.couldntLoad)).toBeTruthy();
    expect(screen.queryByText(MESSAGES.noneHeading)).toBeNull();
    server.status = undefined;
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.tryAgain }));
    expect(await screen.findByText(/I've seen/)).toBeTruthy();
  });

  it("keeps showing the last numbers with a notice when a refresh fails", async () => {
    const server = serve([aPoint()]);
    await show();
    await screen.findByText(/I've seen/);
    server.dead = true;
    const list = screen.getByTestId("utility-costs-list");
    await act(async () => {
      await list.props.refreshControl.props.onRefresh();
    });
    expect(await screen.findByText(SHOWING_LAST_LOADED_MESSAGE)).toBeTruthy();
    expect(screen.getByText(/I've seen/)).toBeTruthy();
  });

  it("shows a skeleton while loading, not an empty state", async () => {
    const server = serve([]);
    server.never = true;
    await show();
    expect(screen.getByTestId("utility-costs-skeleton")).toBeTruthy();
    expect(screen.queryByText(MESSAGES.noneHeading)).toBeNull();
  });

  it("doesn't leave the old total up when a new range fails", async () => {
    const server = serve([aPoint()]);
    await show();
    await screen.findByText(/I've seen/);
    server.status = 500;
    await choosePeriod("Last year");
    expect(await screen.findByText(MESSAGES.couldntLoad)).toBeTruthy();
    expect(screen.queryByText(/I've seen/)).toBeNull();
  });

  it("moves the range on when the date rolls over with the screen open", async () => {
    jest.mocked(useToday).mockReturnValue(new Date(2026, 9, 31));
    const server = serve([aPoint({ period: "2026-10" })]);
    await show();
    await screen.findByText(/I've seen/);
    expect(server.reads.at(-1)?.end_date).toBe("2026-10-31");
    jest.mocked(useToday).mockReturnValue(new Date(2026, 10, 1));
    await screen.rerender(tree());
    await waitFor(() => expect(server.reads.at(-1)?.end_date).toBe("2026-11-01"));
  });

  it("says so when properties fail, and tries them again on refresh", async () => {
    const server = serve([aPoint()]);
    server.propertiesStatus = 500;
    await show();
    expect(await screen.findByText(MESSAGES.propertiesFailed)).toBeTruthy();
    server.propertiesStatus = undefined;
    await act(async () => {
      await screen.getByTestId("utility-costs-list").props.refreshControl.props.onRefresh();
    });
    expect(await screen.findByRole("button", { name: `${ANALYSIS.properties}, ${ANALYSIS.allProperties}` })).toBeTruthy();
    expect(screen.queryByText(MESSAGES.propertiesFailed)).toBeNull();
  });
});
