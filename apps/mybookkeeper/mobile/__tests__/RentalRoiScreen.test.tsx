import type { RentalRoiResponse } from "@mybookkeeper/api-client/types/analytics/rental-roi-response";
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { SHOWING_LAST_LOADED_MESSAGE, ToastProvider } from "@platform/mobile";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import type { AxiosAdapter, AxiosRequestConfig } from "axios";
import { AccessibilityInfo } from "react-native";
import { Provider } from "react-redux";
import { RENTAL_ROI_MESSAGES as MESSAGES } from "../src/constants/rentalRoi";
import RentalRoiScreen from "../src/features/analytics/RentalRoiScreen";
import { store } from "../src/lib/store";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useFocusEffect: () => undefined,
  router: { push: (path: string) => mockPush(path), navigate: jest.fn() },
}));

const originalAdapter = api.defaults.adapter;

function aProperty(overrides: Partial<RentalRoiResponse["properties"][0]> = {}): RentalRoiResponse["properties"][0] {
  return {
    property_id: "p1",
    property_name: "Elm St",
    months_averaged: 6,
    has_purchase_price: true,
    mortgage_source: "records",
    break_even_monthly_cents: 150000,
    target_monthly_cents: 200000,
    actual_revenue_monthly_cents: 180000,
    gap_monthly_cents: -20000,
    gap_basis: "target",
    cash_invested_cents: 500000,
    noi_annual_cents: 1800000,
    cap_rate_pct: "11.52",
    cash_on_cash_pct: "21.60",
    is_personal_home: false,
    cost_breakdown: {
      debt_service_monthly_cents: 100000,
      operating_monthly_cents: 50000,
      mortgage_lines: [{ category: "mortgage_interest", monthly_cents: 100000, window_total_cents: null }],
      operating_lines: [{ category: "utilities", monthly_cents: 50000, window_total_cents: 600000 }],
      escrow_covered_lines: [],
    },
    ...overrides,
  };
}

function aResponse(overrides: Partial<RentalRoiResponse> = {}): RentalRoiResponse {
  const p = aProperty();
  return {
    window_start: "2026-01-01",
    window_end: "2026-11-17",
    target_return_pct: "8",
    has_transactions: true,
    unassigned_revenue_monthly_cents: 0,
    summary: {
      property_count: 1,
      properties_with_target: 1,
      total_break_even_monthly_cents: 150000,
      total_target_monthly_cents: 200000,
      total_actual_revenue_monthly_cents: 180000,
      total_gap_monthly_cents: -20000,
      gap_basis: "target",
    },
    properties: [p],
    ...overrides,
  };
}

interface Server {
  response: RentalRoiResponse | null;
  status: number;
  reads: Record<string, unknown>[];
  never: boolean;
}

function serve(response: RentalRoiResponse | null = aResponse(), status = 200): Server {
  const server: Server = { response, status, reads: [], never: false };
  const adapter: AxiosAdapter = async (config: AxiosRequestConfig & { url?: string }) => {
    const respond = (s: number, data: unknown) => {
      const r = { data, status: s, statusText: "", headers: {}, config } as never;
      if (s >= 400) throw Object.assign(new Error("refused"), { isAxiosError: true, response: r, config });
      return r;
    };
    if (server.never) return new Promise(() => undefined);
    server.reads.push(config.params as Record<string, unknown>);
    return respond(server.status, server.response);
  };
  api.defaults.adapter = adapter;
  return server;
}

function tree() {
  return (
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>
        <RentalRoiScreen />
      </ToastProvider>
    </Provider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPush.mockReset();
  store.dispatch(baseApi.util.resetApiState());
});

afterAll(() => {
  api.defaults.adapter = originalAdapter;
});

describe("RentalRoiScreen", () => {
  it("shows the headline, target input, and a card per property", async () => {
    serve();
    await render(tree());
    expect(await screen.findByTestId("rental-roi-headline")).toBeTruthy();
    // The first headline is simply there when the screen opens; only a new one is read out.
    expect(AccessibilityInfo.announceForAccessibilityWithOptions).not.toHaveBeenCalled();
    expect(screen.getByTestId("rental-roi-target-input")).toBeTruthy();
    expect(screen.getAllByTestId("rental-roi-property-card")).toHaveLength(1);
    expect(screen.getByTestId("rental-roi-total-card")).toBeTruthy();
  });

  it("shows the skeleton while loading, not an error state", async () => {
    const server = serve();
    server.never = true;
    await render(tree());
    expect(screen.getByTestId("rental-roi-skeleton")).toBeTruthy();
    expect(screen.queryByText(MESSAGES.couldntLoad)).toBeNull();
  });

  it("shows an error state when the request fails, with a retry button", async () => {
    const server = serve(null, 500);
    await render(tree());
    expect(await screen.findByText(MESSAGES.couldntLoad)).toBeTruthy();
    server.status = 200;
    server.response = aResponse();
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.tryAgain }));
    expect(await screen.findByTestId("rental-roi-headline")).toBeTruthy();
  });

  it("shows an empty state when there are no properties", async () => {
    serve(aResponse({ properties: [] }));
    await render(tree());
    expect(await screen.findByText(MESSAGES.nonePropertiesHeading)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.nonePropertiesAction }));
    expect(mockPush).toHaveBeenCalledWith("/properties");
  });

  it("shows an empty state when there are no transactions", async () => {
    serve(aResponse({ has_transactions: false }));
    await render(tree());
    expect(await screen.findByText(MESSAGES.noneTransactionsHeading)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.noneTransactionsAction }));
    expect(mockPush).toHaveBeenCalledWith("/transactions");
  });

  it("sends the target return pct in the request", async () => {
    const server = serve();
    await render(tree());
    await screen.findByTestId("rental-roi-headline");
    expect(server.reads[0]).toMatchObject({ target_return_pct: 8 });
  });

  it("debounces the target input, refetches with the new value, and reads out the new headline", async () => {
    const server = serve();
    await render(tree());
    await screen.findByTestId("rental-roi-headline");
    const base = aResponse();
    server.response = aResponse({ target_return_pct: "12", summary: { ...base.summary, total_target_monthly_cents: 300000 } });
    const input = screen.getByTestId("rental-roi-target-input");
    await act(async () => {
      fireEvent.changeText(input, "12");
      // Let debounce tick
      await new Promise((resolve) => setTimeout(resolve, 500));
    });
    await waitFor(() => expect(server.reads.at(-1)?.target_return_pct).toBe(12));
    await waitFor(() => expect(screen.getByTestId("rental-roi-headline-title")).toHaveTextContent(/\$3,000/));
    expect(AccessibilityInfo.announceForAccessibilityWithOptions).toHaveBeenCalledTimes(1);
    expect(AccessibilityInfo.announceForAccessibilityWithOptions).toHaveBeenCalledWith(expect.stringContaining(screen.getByTestId("rental-roi-headline-title").props.children), { queue: true });
  });

  it("keeps the target input and the old figures on screen while a new target loads", async () => {
    const server = serve();
    await render(tree());
    await screen.findByTestId("rental-roi-headline");
    const before = screen.getByTestId("rental-roi-target-input");
    const oldTitle = screen.getByTestId("rental-roi-headline-title").props.children;
    const reads = server.reads.length;
    server.never = true;
    await act(async () => {
      fireEvent.changeText(before, "12");
      await new Promise((resolve) => setTimeout(resolve, 500));
    });
    await waitFor(() => expect(server.reads.length).toBe(reads));
    expect(await screen.findByText(MESSAGES.updatingLabel)).toBeTruthy();
    expect(screen.getByTestId("rental-roi-target-input")).toBe(before);
    expect(screen.getByTestId("rental-roi-headline-title").props.children).toBe(oldTitle);
    expect(screen.queryByTestId("rental-roi-skeleton")).toBeNull();
  });

  it("shows the skeleton below the target input on first load", async () => {
    const server = serve();
    server.never = true;
    await render(tree());
    expect(screen.getByTestId("rental-roi-skeleton")).toBeTruthy();
    expect(screen.getByTestId("rental-roi-target-input")).toBeTruthy();
  });

  it("shows an inline error under the input when a new target fails, so the target can be changed", async () => {
    const server = serve();
    await render(tree());
    await screen.findByTestId("rental-roi-headline");
    const input = screen.getByTestId("rental-roi-target-input");
    server.status = 500;
    await act(async () => {
      fireEvent.changeText(input, "12");
      await new Promise((resolve) => setTimeout(resolve, 500));
    });
    expect(await screen.findByText(MESSAGES.couldntLoad)).toBeTruthy();
    expect(screen.getByTestId("rental-roi-target-input")).toBe(input);
    expect(screen.queryByTestId("rental-roi-headline")).toBeNull();
    server.status = 200;
    server.response = aResponse();
    await act(async () => {
      fireEvent.changeText(input, "9");
      await new Promise((resolve) => setTimeout(resolve, 500));
    });
    expect(await screen.findByTestId("rental-roi-headline")).toBeTruthy();
    expect(screen.queryByText(MESSAGES.couldntLoad)).toBeNull();
  });

  it("shows the unassigned revenue note and links to transactions", async () => {
    serve(aResponse({ unassigned_revenue_monthly_cents: 50000 }));
    await render(tree());
    expect(await screen.findByTestId("rental-roi-unassigned")).toBeTruthy();
    await fireEvent.press(screen.getByRole("link", { name: MESSAGES.assignTransactions }));
    expect(mockPush).toHaveBeenCalledWith("/transactions");
  });

  it("shows add-purchase-price link when property has no target, and navigates to edit", async () => {
    serve(
      aResponse({
        properties: [
          aProperty({
            has_purchase_price: false,
            target_monthly_cents: null,
            gap_basis: "break_even",
          }),
        ],
        summary: {
          property_count: 1,
          properties_with_target: 0,
          total_break_even_monthly_cents: 150000,
          total_target_monthly_cents: 0,
          total_actual_revenue_monthly_cents: 180000,
          total_gap_monthly_cents: 30000,
          gap_basis: "break_even",
        },
      }),
    );
    await render(tree());
    await screen.findByTestId("rental-roi-headline");
    const addLink = screen.getByRole("link", { name: MESSAGES.addPurchasePrice });
    expect(addLink).toBeTruthy();
    await fireEvent.press(addLink);
    expect(mockPush).toHaveBeenCalledWith("/properties/p1/edit");
  });

  it("asks for the loan's original amount when a price is saved but there is still no target", async () => {
    serve(
      aResponse({
        properties: [aProperty({ has_purchase_price: true, target_monthly_cents: null, gap_basis: "break_even" })],
      }),
    );
    await render(tree());
    await screen.findByTestId("rental-roi-headline");
    expect(screen.queryByRole("link", { name: MESSAGES.addPurchasePrice })).toBeNull();
    await fireEvent.press(screen.getByRole("link", { name: MESSAGES.addLoanOriginalAmount }));
    expect(mockPush).toHaveBeenCalledWith("/mortgages");
  });

  it("lists what adds up to break-even in the details", async () => {
    serve();
    await render(tree());
    await screen.findByTestId("rental-roi-headline");
    await fireEvent.press(screen.getByTestId("rental-roi-toggle-p1"));
    const breakdown = within(screen.getByTestId("rental-roi-break-even-breakdown"));
    expect(breakdown.getByText("Interest")).toBeTruthy();
    expect(breakdown.getByText("Utilities")).toBeTruthy();
    expect(breakdown.getByText("From your loan record.")).toBeTruthy();
  });

  it("toggles the details panel for a property", async () => {
    serve();
    await render(tree());
    await screen.findByTestId("rental-roi-headline");
    expect(screen.queryByTestId("rental-roi-property-details")).toBeNull();
    await fireEvent.press(screen.getByTestId("rental-roi-toggle-p1"));
    expect(screen.getByTestId("rental-roi-property-details")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("rental-roi-toggle-p1"));
    expect(screen.queryByTestId("rental-roi-property-details")).toBeNull();
  });

  it("supports pull-to-refresh", async () => {
    const server = serve();
    await render(tree());
    await screen.findByTestId("rental-roi-headline");
    const readsBefore = server.reads.length;
    await act(async () => {
      await screen.getByTestId("rental-roi-scroll").props.refreshControl.props.onRefresh();
    });
    expect(server.reads.length).toBeGreaterThan(readsBefore);
  });

  it("keeps the figures and says so when a refresh fails", async () => {
    const server = serve();
    await render(tree());
    await screen.findByTestId("rental-roi-headline");
    expect(screen.queryByText(SHOWING_LAST_LOADED_MESSAGE)).toBeNull();
    server.status = 500;
    await act(async () => {
      await screen.getByTestId("rental-roi-scroll").props.refreshControl.props.onRefresh();
    });
    expect(await screen.findByText(SHOWING_LAST_LOADED_MESSAGE)).toBeTruthy();
    expect(screen.getByTestId("rental-roi-headline")).toBeTruthy();
  });

  it("shows the mortgage source note when estimated from transactions", async () => {
    serve(aResponse({ properties: [aProperty({ mortgage_source: "transactions" })] }));
    await render(tree());
    await screen.findByTestId("rental-roi-headline");
    expect(screen.getByText(MESSAGES.mortgageFromTransactions)).toBeTruthy();
  });

  it("shows add-mortgage link and navigates when mortgage source is none", async () => {
    serve(aResponse({ properties: [aProperty({ mortgage_source: "none" })] }));
    await render(tree());
    await screen.findByTestId("rental-roi-headline");
    expect(screen.getByText(MESSAGES.mortgageNone)).toBeTruthy();
    await fireEvent.press(screen.getByRole("link", { name: MESSAGES.addMortgage }));
    expect(mockPush).toHaveBeenCalledWith("/mortgages");
  });

  it("shows a few-months badge for a property with little data", async () => {
    serve(aResponse({ properties: [aProperty({ months_averaged: 1 })] }));
    await render(tree());
    await screen.findByTestId("rental-roi-headline");
    expect(screen.getByText("Based on 1 month")).toBeTruthy();
  });
});
