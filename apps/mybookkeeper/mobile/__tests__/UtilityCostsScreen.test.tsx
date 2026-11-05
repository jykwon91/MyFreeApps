import type { UtilityTrendPoint } from "@mybookkeeper/api-client/types/analytics/utility-trend-point";
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { AxiosAdapter, AxiosRequestConfig } from "axios";
import { Provider } from "react-redux";
import { UTILITY_COSTS_MESSAGES as MESSAGES } from "../src/constants/analytics";
import { SHOWING_LAST_LOADED_MESSAGE } from "../src/constants/offline";
import {
  barPercent,
  monthRows,
  presetRange,
  rangeLabel,
  totalCents,
  utilityLabel,
  utilityRows,
} from "../src/features/analytics/utilityCostsDisplay";
import UtilityCostsScreen from "../src/features/analytics/UtilityCostsScreen";
import { useCanWrite } from "../src/features/workspace/useCanWrite";
import { store } from "../src/lib/store";
import { useToday } from "../src/lib/useToday";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useFocusEffect: () => undefined,
  router: { push: (path: string) => mockPush(path) },
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
    if (server.never) return new Promise(() => undefined);
    if (server.dead) throw Object.assign(new Error("Network Error"), { isAxiosError: true, config });
    server.reads.push(config.params as Record<string, unknown>);
    if (server.status) return respond(server.status, {});
    return respond(200, { trends: server.trends, summary: {}, total_spend: 0 });
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

beforeEach(() => {
  store.dispatch(baseApi.util.resetApiState());
  mockPush.mockReset();
  jest.mocked(useCanWrite).mockReturnValue(true);
  jest.mocked(useToday).mockReturnValue(NOW);
});

afterAll(() => {
  api.defaults.adapter = originalAdapter;
});

describe("utilityCostsDisplay", () => {
  it("builds the last 12 months from the device's date, starting on the first of the month", () => {
    expect(presetRange("last12", new Date(2026, 10, 4))).toEqual({ startDate: "2025-12-01", endDate: "2026-11-04" });
  });

  it("keeps the device's calendar date late at night", () => {
    expect(presetRange("thisYear", new Date(2026, 11, 31, 23, 59))).toEqual({ startDate: "2026-01-01", endDate: "2026-12-31" });
  });

  it("covers all of last year", () => {
    expect(presetRange("lastYear", new Date(2026, 0, 1))).toEqual({ startDate: "2025-01-01", endDate: "2025-12-31" });
  });

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
    const months = monthRows([aPoint({ period: "2025-12", total: 10 }), aPoint({ period: "2026-02", total: 20 })], { startDate: "2025-12-01", endDate: "2026-02-15" });
    expect(months.map((month) => [month.period, month.cents])).toEqual([["2026-02", 2000], ["2026-01", 0], ["2025-12", 1000]]);
  });

  it("keeps a small bar visible and an empty one empty", () => {
    expect(barPercent(1, 100000)).toBe(2);
    expect(barPercent(0, 100000)).toBe(0);
    expect(barPercent(50, 100)).toBe(50);
  });

  it("says the range in months", () => {
    expect(rangeLabel({ startDate: "2025-12-01", endDate: "2026-11-04" })).toBe("Dec 2025 to Nov 2026");
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

    await fireEvent.press(screen.getByRole("tab", { name: "Last year" }));
    await waitFor(() => expect(server.reads.at(-1)?.start_date).toBe(`${NOW.getFullYear() - 1}-01-01`));
    await screen.findByText(/I've seen/);

    await fireEvent.press(screen.getByRole("button", { name: `${MESSAGES.property}, ${MESSAGES.allProperties}` }));
    await fireEvent.press(await screen.findByText("Oak Ave"));
    await waitFor(() => expect(server.reads.at(-1)?.property_ids).toBe("p2"));
  });

  it("hides the property choice when there's only one property", async () => {
    serve([aPoint()], [{ id: "p1", name: "Elm St" }]);
    await show();
    await screen.findByText(/I've seen/);
    expect(screen.queryByText(MESSAGES.property)).toBeNull();
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
    await fireEvent.press(screen.getByRole("tab", { name: "Last year" }));
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
    await fireEvent.press(screen.getByRole("tab", { name: "Last year" }));
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
    expect(await screen.findByRole("button", { name: `${MESSAGES.property}, ${MESSAGES.allProperties}` })).toBeTruthy();
    expect(screen.queryByText(MESSAGES.propertiesFailed)).toBeNull();
  });
});
