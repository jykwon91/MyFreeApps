import { propertyPnlRange } from "@mybookkeeper/api-client/utils/propertyPnlRange";
import type { PropertyPnLResponse } from "@mybookkeeper/api-client/types/attribution/property-pnl-response";
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { AxiosAdapter, AxiosRequestConfig } from "axios";
import type { ReactNode } from "react";
import { Provider } from "react-redux";
import { SHOWING_LAST_LOADED_MESSAGE } from "../src/constants/offline";
import { PROPERTY_PNL_MESSAGES as MESSAGES } from "../src/constants/propertyPnl";
import { NO_FILTERS } from "../src/constants/transactionFilters";
import PropertyPnlScreen from "../src/features/propertyPnl/PropertyPnlScreen";
import { moreCategoriesLine } from "../src/features/propertyPnl/propertyPnlDisplay";
import { transactionsLink } from "../src/features/transactions/transactionFilters";
import { store } from "../src/lib/store";

const mockNavigate = jest.fn();
jest.mock("expo-router", () => ({ useFocusEffect: () => undefined, router: { navigate: (path: string) => mockNavigate(path) } }));
jest.mock("react-native/Libraries/Modal/Modal", () => ({
  __esModule: true,
  default: ({ visible, children }: { visible: boolean; children: unknown }) => (visible ? children : null),
}));

const originalAdapter = api.defaults.adapter;

function aReport(overrides: Partial<PropertyPnLResponse> = {}): PropertyPnLResponse {
  return {
    since: "2026-01-01",
    until: "2026-01-31",
    properties: [
      {
        property_id: "p1",
        name: "Oak Street",
        revenue_cents: 300000,
        expenses_cents: 120050,
        net_cents: 179950,
        expense_breakdown: [
          { category: "maintenance", amount_cents: 50000 },
          { category: "utilities", amount_cents: 30000 },
          { category: "insurance", amount_cents: 20000 },
          { category: "taxes", amount_cents: 10000 },
          { category: "advertising", amount_cents: 10050 },
        ],
      },
      { property_id: "p2", name: "Elm Court", revenue_cents: 0, expenses_cents: 50000, net_cents: -50000, expense_breakdown: [] },
    ],
    total_revenue_cents: 300000,
    total_expenses_cents: 170050,
    total_net_cents: 129950,
    ...overrides,
  };
}

interface Server {
  report: PropertyPnLResponse;
  status: number;
  asked: unknown[];
}

function serve(report: PropertyPnLResponse = aReport()): Server {
  const server: Server = { report, status: 200, asked: [] };
  const adapter: AxiosAdapter = async (config: AxiosRequestConfig & { url?: string }) => {
    server.asked.push(config.params);
    const response = { data: server.status >= 400 ? {} : server.report, status: server.status, statusText: "", headers: {}, config } as never;
    if (server.status >= 400) throw Object.assign(new Error("refused"), { isAxiosError: true, response, config });
    return response;
  };
  api.defaults.adapter = adapter;
  return server;
}

function wrapper({ children }: { children: ReactNode }) {
  return <Provider store={store}>{children}</Provider>;
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function show(): Promise<void> {
  await render(<PropertyPnlScreen />, { wrapper });
  await settle();
}

beforeEach(() => {
  store.dispatch(baseApi.util.resetApiState());
  mockNavigate.mockClear();
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
});

describe("property profit and loss", () => {
  it("asks for this month by default", async () => {
    const server = serve();
    await show();
    const month = propertyPnlRange("this_month", new Date());
    expect(server.asked[0]).toEqual({ since: month.since, until: month.until });
  });

  it("shows the totals and a card for each property", async () => {
    serve();
    await show();
    expect(screen.getByText("Oak Street")).toBeTruthy();
    expect(screen.getByText("Elm Court")).toBeTruthy();
    expect(screen.getByText("+$1,799.50")).toBeTruthy();
    expect(screen.getByText(MESSAGES.approvedOnly)).toBeTruthy();
  });

  it("shows four categories and counts the rest", async () => {
    serve();
    await show();
    expect(screen.getByText("Maintenance")).toBeTruthy();
    expect(screen.queryByText("Advertising")).toBeNull();
    expect(screen.getByText(moreCategoriesLine(1))).toBeTruthy();
  });

  it("opens the approved transactions behind a card", async () => {
    serve();
    await show();
    await fireEvent.press(screen.getAllByHintText(MESSAGES.opensTransactions)[0]);
    const month = propertyPnlRange("this_month", new Date());
    expect(mockNavigate).toHaveBeenCalledWith(
      transactionsLink({ ...NO_FILTERS, period: "custom", startDate: month.since, endDate: month.until, propertyId: "p1", approvedOnly: true }),
    );
  });

  it("asks again for the period picked in the sheet", async () => {
    const server = serve();
    await show();
    await fireEvent.press(screen.getByLabelText(new RegExp(`^${MESSAGES.period}`)));
    await fireEvent.press(screen.getByRole("radio", { name: "YTD" }));
    await fireEvent.press(screen.getByText(MESSAGES.showResults));
    await settle();
    const ytd = propertyPnlRange("ytd", new Date());
    expect(server.asked.at(-1)).toEqual({ since: ytd.since, until: ytd.until });
  });

  it("throws away a choice that is closed without applying", async () => {
    const server = serve();
    await show();
    const reads = server.asked.length;
    await fireEvent.press(screen.getByLabelText(new RegExp(`^${MESSAGES.period}`)));
    await fireEvent.press(screen.getByRole("radio", { name: "YTD" }));
    await fireEvent.press(screen.getByText(MESSAGES.close));
    await settle();
    expect(server.asked).toHaveLength(reads);
  });

  it("says there are no numbers, and offers the year so far, when the period is empty", async () => {
    const server = serve(aReport({ properties: [], total_revenue_cents: 0, total_expenses_cents: 0, total_net_cents: 0 }));
    await show();
    expect(screen.getByText(MESSAGES.noneHeading)).toBeTruthy();
    await fireEvent.press(screen.getByText(MESSAGES.showYearToDate));
    await settle();
    expect(server.asked.at(-1)).toEqual({ since: propertyPnlRange("ytd", new Date()).since, until: propertyPnlRange("ytd", new Date()).until });
  });

  it("says it couldn't load, never that there is nothing, and can retry", async () => {
    const server = serve();
    server.status = 500;
    await show();
    expect(screen.getByText(MESSAGES.couldntLoad)).toBeTruthy();
    expect(screen.queryByText(MESSAGES.noneHeading)).toBeNull();
    server.status = 200;
    await fireEvent.press(screen.getByText(MESSAGES.tryAgain));
    await settle();
    expect(screen.getByText("Oak Street")).toBeTruthy();
  });

  it("shows a skeleton while it loads", async () => {
    api.defaults.adapter = () => new Promise(() => undefined);
    await render(<PropertyPnlScreen />, { wrapper });
    expect(screen.queryByText(MESSAGES.couldntLoad)).toBeNull();
    expect(screen.queryByText(MESSAGES.noneHeading)).toBeNull();
  });

  it("keeps the cards and says so when a refresh fails", async () => {
    const server = serve();
    await show();
    server.status = 500;
    await act(async () => {
      await screen.getByTestId("property-pnl-list").props.refreshControl.props.onRefresh();
    });
    await settle();
    expect(screen.getByText("Oak Street")).toBeTruthy();
    expect(screen.getByText(SHOWING_LAST_LOADED_MESSAGE)).toBeTruthy();
  });
});
