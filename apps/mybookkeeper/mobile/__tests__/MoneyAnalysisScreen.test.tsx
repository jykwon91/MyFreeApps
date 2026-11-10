import { ANALYTICS_RANGE_PRESETS } from "@mybookkeeper/api-client/constants/analyticsRanges";
import type { SummaryResponse } from "@mybookkeeper/api-client/types/summary/summary";
import { propertyPnlRange } from "@mybookkeeper/api-client/utils/propertyPnlRange";
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import type { AxiosAdapter, AxiosRequestConfig } from "axios";
import { StyleSheet } from "react-native";
import { Provider } from "react-redux";
import { MONEY_ANALYSIS_MESSAGES as MESSAGES } from "../src/constants/moneyAnalysis";
import { SHOWING_LAST_LOADED_MESSAGE } from "@platform/mobile";
import MoneyAnalysisScreen from "../src/features/moneyAnalysis/MoneyAnalysisScreen";
import { store } from "../src/lib/store";
import { useToday } from "../src/lib/useToday";

const mockNavigate = jest.fn();
jest.mock("expo-router", () => ({ useFocusEffect: () => undefined, router: { navigate: (path: string) => mockNavigate(path), push: jest.fn() } }));
jest.mock("../src/lib/useToday", () => ({ useToday: jest.fn() }));
jest.mock("react-native/Libraries/Modal/Modal", () => ({
  __esModule: true,
  default: ({ visible, children }: { visible: boolean; children: unknown }) => (visible ? children : null),
}));

const originalAdapter = api.defaults.adapter;
const NOW = new Date(2026, 10, 9);

function aSummary(overrides: Partial<SummaryResponse> = {}): SummaryResponse {
  return {
    revenue: 1000,
    expenses: 400,
    profit: 600,
    by_category: { rental_revenue: 1000, maintenance: 300, utilities: 100 },
    by_property: [
      { property_id: "p1", name: "Elm St", revenue: 700, expenses: 300, profit: 400 },
      { property_id: "p2", name: "Oak Ave", revenue: 300, expenses: 100, profit: 200 },
    ],
    by_month: [
      { month: "2026-09", revenue: 400, expenses: 100, profit: 300 },
      { month: "2026-10", revenue: 600, expenses: 300, profit: 300 },
    ],
    by_month_expense: [
      { month: "2026-09", utilities: 100 },
      { month: "2026-10", maintenance: 300 },
    ],
    by_month_revenue: [
      { month: "2026-09", rental_revenue: 400 },
      { month: "2026-10", rental_revenue: 600 },
    ],
    by_property_month: [{ property_id: "p1", name: "Elm St", months: [{ month: "2026-10", revenue: 700, expenses: 300, profit: 400 }] }],
    ...overrides,
  };
}

const NOTHING: SummaryResponse = { revenue: 0, expenses: 0, profit: 0, by_category: {}, by_property: [], by_month: [], by_month_expense: [], by_month_revenue: [], by_property_month: [] };

interface Read {
  start?: string;
  end?: string;
  propertyIds: string[];
}

interface Server {
  reads: Read[];
  answer: (read: Read) => SummaryResponse;
  failFor?: (read: Read) => boolean;
  status?: number;
  never: boolean;
  /** Never answers the reads this matches. */
  hangFor?: (read: Read) => boolean;
  yearsStatus?: number;
}

function serve(answer: (read: Read) => SummaryResponse = () => aSummary()): Server {
  const server: Server = { reads: [], answer, never: false };
  const adapter: AxiosAdapter = async (config: AxiosRequestConfig & { url?: string }) => {
    const respond = (status: number, data: unknown) => {
      const response = { data, status, statusText: "", headers: {}, config } as never;
      if (status >= 400) throw Object.assign(new Error("refused"), { isAxiosError: true, response, config });
      return response;
    };
    const url = config.url ?? "";
    if (url === "/properties") return respond(200, [{ id: "p1", name: "Elm St" }, { id: "p2", name: "Oak Ave" }]);
    if (url.startsWith("/summary/years")) return server.yearsStatus ? respond(server.yearsStatus, {}) : respond(200, [2026, 2025]);
    if (server.never) return new Promise(() => undefined);
    const query = new URLSearchParams(url.split("?")[1] ?? "");
    const read: Read = { start: query.get("start_date") ?? undefined, end: query.get("end_date") ?? undefined, propertyIds: query.getAll("property_ids") };
    server.reads.push(read);
    if (server.hangFor?.(read)) return new Promise(() => undefined);
    if (server.status || server.failFor?.(read)) return respond(server.status ?? 500, {});
    return respond(200, server.answer(read));
  };
  api.defaults.adapter = adapter;
  return server;
}

async function show(): Promise<void> {
  await render(
    <Provider store={store}>
      <MoneyAnalysisScreen />
    </Provider>,
  );
}

async function choosePeriod(label: string): Promise<void> {
  await fireEvent.press(screen.getByRole("button", { name: /^Period,/ }));
  await fireEvent.press(await screen.findByText(label));
  await fireEvent.press(screen.getByRole("button", { name: MESSAGES.showResults }));
}

async function chooseCompare(label: string): Promise<void> {
  await fireEvent.press(screen.getByRole("button", { name: /^Compare with,/ }));
  await fireEvent.press(await screen.findByText(label));
}

const LAST_YEAR = "2025-01-01";

async function openCategories(): Promise<void> {
  await fireEvent.press(screen.getByRole("button", { name: `${MESSAGES.categories}, ${MESSAGES.allCategories}` }));
}

beforeEach(() => {
  store.dispatch(baseApi.util.resetApiState());
  mockNavigate.mockReset();
  jest.mocked(useToday).mockReturnValue(NOW);
});

afterAll(() => {
  api.defaults.adapter = originalAdapter;
});

describe("MoneyAnalysisScreen", () => {
  it("shows a skeleton while loading, never zero or an empty state", async () => {
    const server = serve();
    server.never = true;
    await show();
    expect(screen.getByTestId("analysis-skeleton")).toBeTruthy();
    expect(screen.queryByText(MESSAGES.noneHeading)).toBeNull();
    expect(screen.queryByText("$0.00")).toBeNull();
  });

  it("shows net, revenue and expenses for the year so far, counting approved only", async () => {
    const server = serve();
    await show();
    expect(await screen.findByRole("text", { name: "Net, 600 dollars" })).toBeTruthy();
    expect(screen.getByText("+$600.00")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Revenue, 1,000 dollars" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Expenses, 400 dollars" })).toBeTruthy();
    expect(screen.getByText(MESSAGES.approvedOnly)).toBeTruthy();
    expect(server.reads[0]).toEqual({ start: "2026-01-01", end: "2026-11-09", propertyIds: [] });
  });

  it("shows the monthly average over the months with activity", async () => {
    serve();
    await show();
    expect(await screen.findByText(MESSAGES.acrossMonths(2))).toBeTruthy();
    expect(screen.getByText("$500.00")).toBeTruthy();
  });

  it("tells a failed load from an empty one, offers Try again, and recovers", async () => {
    const server = serve();
    server.status = 500;
    await show();
    expect(await screen.findByText(MESSAGES.couldntLoad)).toBeTruthy();
    expect(screen.queryByText(MESSAGES.noneHeading)).toBeNull();
    expect(screen.queryByText("$0.00")).toBeNull();
    server.status = undefined;
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.tryAgain }));
    expect(await screen.findByText(MESSAGES.approvedOnly)).toBeTruthy();
  });

  it("says there is nothing, rather than zero, when no approved transactions fall in the dates", async () => {
    serve(() => NOTHING);
    await show();
    expect(await screen.findByText(MESSAGES.noneHeading)).toBeTruthy();
    expect(screen.queryByText(MESSAGES.approvedOnly)).toBeNull();
  });

  it("keeps the last numbers with a notice when a refresh fails", async () => {
    const server = serve();
    await show();
    await screen.findByText(MESSAGES.approvedOnly);
    server.status = 500;
    await act(async () => {
      await screen.getByTestId("analysis-screen").props.refreshControl.props.onRefresh();
    });
    expect(await screen.findByText(SHOWING_LAST_LOADED_MESSAGE)).toBeTruthy();
    expect(screen.getByText(MESSAGES.approvedOnly)).toBeTruthy();
  });

  it.each(ANALYTICS_RANGE_PRESETS.map((preset) => [preset.label, preset.key] as const))("asks for %s as the dates it means", async (label, key) => {
    const server = serve();
    await show();
    await screen.findByText(MESSAGES.approvedOnly);
    await choosePeriod(label);
    const range = propertyPnlRange(key, NOW);
    await waitFor(() => expect(server.reads.at(-1)).toMatchObject({ start: range.since, end: range.until }));
  });

  it("asks for a whole year, and for all time with no dates", async () => {
    const server = serve();
    await show();
    await screen.findByText(MESSAGES.approvedOnly);
    await choosePeriod("2025");
    await waitFor(() => expect(server.reads.at(-1)).toMatchObject({ start: LAST_YEAR, end: "2025-12-31" }));
    await choosePeriod("All time");
    await waitFor(() => expect(server.reads.at(-1)).toEqual({ start: undefined, end: undefined, propertyIds: [] }));
    expect(screen.getByRole("button", { name: /^Compare with,/ }).props.accessibilityState.disabled).toBe(true);
  });

  it("applies hand-picked dates", async () => {
    const server = serve();
    await show();
    await screen.findByText(MESSAGES.approvedOnly);
    await fireEvent.press(screen.getByRole("button", { name: /^Period,/ }));
    await fireEvent.press(await screen.findByText(MESSAGES.customRange));
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.showResults }));
    await waitFor(() => expect(server.reads.at(-1)).toMatchObject({ start: "2026-01-01", end: "2026-11-09" }));
    expect(screen.getByRole("button", { name: /^Period, Custom range/ })).toBeTruthy();
  });

  it("moves a preset on when the date rolls over, but not a year", async () => {
    const server = serve();
    await show();
    await screen.findByText(MESSAGES.approvedOnly);
    jest.mocked(useToday).mockReturnValue(new Date(2026, 10, 10));
    await screen.rerender(
      <Provider store={store}>
        <MoneyAnalysisScreen />
      </Provider>,
    );
    await waitFor(() => expect(server.reads.at(-1)?.end).toBe("2026-11-10"));
  });

  it("counts only the properties picked", async () => {
    const server = serve();
    await show();
    await screen.findByText(MESSAGES.approvedOnly);
    await fireEvent.press(screen.getByRole("button", { name: `${MESSAGES.properties}, ${MESSAGES.allProperties}` }));
    await fireEvent.press(screen.getAllByText("Oak Ave")[0]);
    await waitFor(() => expect(server.reads.at(-1)?.propertyIds).toEqual(["p2"]));
  });

  describe("comparing", () => {
    const previousYear = (read: Read) => (read.start === "2025-01-01");

    it("sets each total against the earlier stretch with the move in dollars and percent", async () => {
      const server = serve((read) => (previousYear(read) ? aSummary({ revenue: 800, expenses: 500, profit: 300 }) : aSummary()));
      await show();
      await screen.findByText(MESSAGES.approvedOnly);
      await chooseCompare("The same dates last year");
      await waitFor(() => expect(server.reads.at(-1)).toMatchObject({ start: "2025-01-01", end: "2025-11-09" }));
      expect(await screen.findByText("+$200.00 (+25%) · Before: $800.00")).toBeTruthy();
      expect(screen.getByText("\u2212$100.00 (-20%) · Before: $500.00")).toBeTruthy();
      expect(screen.getByText("+$300.00 (+100%) · Before: $300.00")).toBeTruthy();
    });

    it("sets this period against the one before it", async () => {
      const server = serve();
      await show();
      await screen.findByText(MESSAGES.approvedOnly);
      await choosePeriod("Last month");
      await chooseCompare("The period before");
      await waitFor(() => expect(server.reads.at(-1)).toMatchObject({ start: "2026-09-01", end: "2026-09-30" }));
    });

    it("says there was nothing before, never a percentage, when the earlier total was zero", async () => {
      serve((read) => (previousYear(read) ? NOTHING : aSummary()));
      await show();
      await screen.findByText(MESSAGES.approvedOnly);
      await chooseCompare("The same dates last year");
      expect((await screen.findAllByText(/nothing to compare with before/i)).length).toBeGreaterThan(0);
      expect(screen.queryByText(/NaN|Infinity/)).toBeNull();
      expect(screen.queryByText(/%\)/)).toBeNull();
    });

    it("says so when the earlier stretch won't load, keeps the current numbers, and can retry", async () => {
      const server = serve();
      await show();
      await screen.findByText(MESSAGES.approvedOnly);
      server.failFor = previousYear;
      await chooseCompare("The same dates last year");
      expect(await screen.findByText(MESSAGES.comparisonFailed)).toBeTruthy();
      expect(screen.getByText(MESSAGES.approvedOnly)).toBeTruthy();
      expect(screen.queryByTestId("change-note")).toBeNull();
      server.failFor = undefined;
      await fireEvent.press(screen.getByRole("button", { name: MESSAGES.retryComparison }));
      await waitFor(() => expect(screen.queryByText(MESSAGES.comparisonFailed)).toBeNull());
    });
  });

  describe("category filter", () => {
    it("counts only expenses when asked, without asking the server again", async () => {
      const server = serve();
      await show();
      await screen.findByText(MESSAGES.approvedOnly);
      const reads = server.reads.length;
      await openCategories();
      await fireEvent.press(await screen.findByText(MESSAGES.expensesOnly));
      await fireEvent.press(screen.getByRole("button", { name: "Done" }));
      expect(await screen.findByText("\u2212$400.00")).toBeTruthy();
      expect(server.reads.length).toBe(reads);
      expect(screen.getByRole("button", { name: `${MESSAGES.categories}, ${MESSAGES.expensesOnly}` })).toBeTruthy();
    });

    it("keeps each month in step with the total when only some categories are on", async () => {
      serve();
      await show();
      await screen.findByText(MESSAGES.approvedOnly);
      await openCategories();
      await fireEvent.press(await screen.findByText(MESSAGES.incomeOnly));
      await fireEvent.press(screen.getByRole("button", { name: "Done" }));
      await screen.findByRole("button", { name: /^September 2026, net 400 dollars/ });
      expect(screen.getByRole("button", { name: /^October 2026, net 600 dollars/ })).toBeTruthy();
    });

    it("keeps just one category with Only", async () => {
      serve();
      await show();
      await screen.findByText(MESSAGES.approvedOnly);
      await openCategories();
      await fireEvent.press(await screen.findByRole("button", { name: `${MESSAGES.only} Maintenance` }));
      await fireEvent.press(screen.getByRole("button", { name: "Done" }));
      expect((await screen.findAllByText("\u2212$300.00")).length).toBeGreaterThan(0);
      expect(screen.getByRole("button", { name: `${MESSAGES.categories}, ${MESSAGES.nCategories(1, 25)}` })).toBeTruthy();
    });

    it("offers a way back when the categories leave nothing to show", async () => {
      serve(() => aSummary({ by_category: { rental_revenue: 1000 }, revenue: 1000, expenses: 0, profit: 1000, by_month: [], by_property: [], by_month_expense: [], by_property_month: [] }));
      await show();
      await screen.findByText(MESSAGES.approvedOnly);
      await openCategories();
      await fireEvent.press(await screen.findByText(MESSAGES.expensesOnly));
      await fireEvent.press(screen.getByRole("button", { name: "Done" }));
      expect(await screen.findByText(MESSAGES.noneHeading)).toBeTruthy();
      await fireEvent.press(screen.getByRole("button", { name: MESSAGES.clear }));
      expect(await screen.findByText(MESSAGES.approvedOnly)).toBeTruthy();
    });
  });

  describe("figures a screen reader reaches", () => {
    it("reads each change as its own item beside the figure, not hidden inside a labelled button", async () => {
      serve((read) => (read.start === LAST_YEAR ? aSummary({ revenue: 800, expenses: 500, profit: 300 }) : aSummary()));
      await show();
      await screen.findByText(MESSAGES.approvedOnly);
      await chooseCompare("The same dates last year");
      await screen.findByText("+$200.00 (+25%) · Before: $800.00");
      const revenue = screen.getByRole("button", { name: "Revenue, 1,000 dollars" });
      expect(within(revenue).queryByTestId("change-note")).toBeNull();
      expect(screen.getAllByLabelText(/Up 200 dollars, 25 percent against the same dates last year\. Before: \$800\.00/).length).toBeGreaterThan(0);
      const average = screen.getByLabelText(/^Revenue, .* a month$/);
      expect(within(average).queryByTestId("change-note")).toBeNull();
    });

    it("shows the comparison as loading, then settles", async () => {
      const server = serve();
      await show();
      await screen.findByText(MESSAGES.approvedOnly);
      server.hangFor = (read) => read.start === LAST_YEAR;
      await chooseCompare("The same dates last year");
      expect(await screen.findByText(MESSAGES.loadingComparison)).toBeTruthy();
    });

    it("says when the years won't load and tries again, rather than quietly dropping the year choices", async () => {
      const server = serve();
      server.yearsStatus = 500;
      await show();
      expect(await screen.findByText(MESSAGES.yearsFailed)).toBeTruthy();
      server.yearsStatus = undefined;
      await fireEvent.press(screen.getByRole("button", { name: MESSAGES.retryYears }));
      await waitFor(() => expect(screen.queryByText(MESSAGES.yearsFailed)).toBeNull());
    });

    it("shows deposits and other uncategorised money in a neutral colour, not the expense colour", async () => {
      serve(() => aSummary({ by_category: { rental_revenue: 1000, maintenance: 300, security_deposit: 200 } }));
      await show();
      await screen.findByText(MESSAGES.approvedOnly);
      const color = (category: string) => StyleSheet.flatten(screen.getByTestId(`category-bar-${category}`).props.style).backgroundColor;
      expect(color("security_deposit")).not.toBe(color("maintenance"));
      expect(color("security_deposit")).not.toBe(color("rental_revenue"));
    });
  });

  describe("the transactions behind a number", () => {
    it("carries the categories left on into the revenue and expenses figures", async () => {
      serve();
      await show();
      await screen.findByText(MESSAGES.approvedOnly);
      await openCategories();
      await fireEvent.press(await screen.findByRole("button", { name: `${MESSAGES.only} Maintenance` }));
      await fireEvent.press(screen.getByRole("button", { name: "Done" }));
      await fireEvent.press((await screen.findAllByRole("button", { name: "Expenses, 300 dollars" }))[0]);
      const link = new URL(`http://x${mockNavigate.mock.calls.at(-1)?.[0]}`);
      expect([link.searchParams.get("type"), link.searchParams.get("categories")]).toEqual(["expenses", "maintenance"]);
    });

    it("stops the current month at today and starts a month where the dates start", async () => {
      serve(() => aSummary({ by_month: [{ month: "2026-11", revenue: 50, expenses: 0, profit: 50 }], by_month_revenue: [{ month: "2026-11", rental_revenue: 50 }], by_month_expense: [] }));
      await show();
      await screen.findByText(MESSAGES.approvedOnly);
      await fireEvent.press(screen.getByRole("button", { name: /^November 2026, net/ }));
      await fireEvent.press(screen.getByRole("button", { name: "Revenue, 50 dollars" }));
      const link = new URL(`http://x${mockNavigate.mock.calls.at(-1)?.[0]}`);
      expect([link.searchParams.get("from"), link.searchParams.get("to")]).toEqual(["2026-11-01", "2026-11-09"]);
    });

    it("opens revenue and expenses over the dates and properties looked at", async () => {
      serve();
      await show();
      await screen.findByText(MESSAGES.approvedOnly);
      await fireEvent.press(screen.getByRole("button", { name: "Revenue, 1,000 dollars" }));
      const link = new URL(`http://x${mockNavigate.mock.calls.at(-1)?.[0]}`);
      expect(link.pathname).toBe("/analytics/drill-down");
      expect(link.searchParams.get("type")).toBe("revenue");
      expect(link.searchParams.get("from")).toBe("2026-01-01");
      expect(link.searchParams.get("to")).toBe("2026-11-09");
      await fireEvent.press(screen.getByRole("button", { name: "Expenses, 400 dollars" }));
      expect(new URL(`http://x${mockNavigate.mock.calls.at(-1)?.[0]}`).searchParams.get("type")).toBe("expenses");
    });

    it("opens a category", async () => {
      serve();
      await show();
      await screen.findByText(MESSAGES.approvedOnly);
      await fireEvent.press(screen.getByRole("button", { name: "Maintenance, 300 dollars" }));
      expect(new URL(`http://x${mockNavigate.mock.calls.at(-1)?.[0]}`).searchParams.get("category")).toBe("maintenance");
    });

    it("opens one month's revenue, and a category within it, for just that month", async () => {
      serve();
      await show();
      await screen.findByText(MESSAGES.approvedOnly);
      await fireEvent.press(screen.getByRole("button", { name: /^October 2026, net/ }));
      await fireEvent.press(screen.getByRole("button", { name: "Revenue, 600 dollars" }));
      let link = new URL(`http://x${mockNavigate.mock.calls.at(-1)?.[0]}`);
      expect([link.searchParams.get("type"), link.searchParams.get("from"), link.searchParams.get("to")]).toEqual(["revenue", "2026-10-01", "2026-10-31"]);
      await fireEvent.press(screen.getAllByRole("button", { name: "Maintenance, 300 dollars" })[0]);
      link = new URL(`http://x${mockNavigate.mock.calls.at(-1)?.[0]}`);
      expect([link.searchParams.get("category"), link.searchParams.get("from")]).toEqual(["maintenance", "2026-10-01"]);
    });

    it("opens a property's rows, and its month, for that property alone", async () => {
      serve();
      await show();
      await screen.findByText(MESSAGES.approvedOnly);
      await fireEvent.press(screen.getByRole("button", { name: /^Elm St, net/ }));
      await fireEvent.press(screen.getAllByRole("button", { name: "Revenue, 700 dollars" })[0]);
      let link = new URL(`http://x${mockNavigate.mock.calls.at(-1)?.[0]}`);
      expect([link.searchParams.get("property"), link.searchParams.get("type")]).toEqual(["p1", "revenue"]);
      await fireEvent.press(screen.getAllByRole("button", { name: /^Revenue/ }).at(-1) as never);
      link = new URL(`http://x${mockNavigate.mock.calls.at(-1)?.[0]}`);
      expect([link.searchParams.get("property"), link.searchParams.get("from"), link.searchParams.get("to")]).toEqual(["p1", "2026-10-01", "2026-10-31"]);
    });
  });

  it("shows how each property's profit moved when comparing", async () => {
    serve((read) => (read.start === "2025-01-01" ? aSummary({ by_property: [{ property_id: "p1", name: "Elm St", revenue: 300, expenses: 100, profit: 200 }] }) : aSummary()));
    await show();
    await screen.findByText(MESSAGES.approvedOnly);
    await chooseCompare("The same dates last year");
    expect(await screen.findByText("+$200.00 (+100%) · Before: $200.00")).toBeTruthy();
    expect(screen.getByText(/nothing to compare with before.* · Before: \$0\.00/i)).toBeTruthy();
  });
});
