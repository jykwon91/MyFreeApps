import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Provider } from "react-redux";
import { DRILL_DOWN_PAGE_SIZE } from "@mybookkeeper/api-client/constants/transactionPaging";
import type { Transaction } from "@mybookkeeper/api-client/types/transaction/transaction";
import { DRILL_DOWN_MESSAGES as MESSAGES } from "../src/constants/moneyAnalysis";
import { SHOWING_LAST_LOADED_MESSAGE } from "@platform/mobile";
import DrillDownScreen from "../src/features/drillDown/DrillDownScreen";
import { store } from "../src/lib/store";
import { aTransaction, startTransactionServer } from "../test-support/transactionsServer";

const mockPush = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock("expo-router", () => ({
  useFocusEffect: () => undefined,
  useLocalSearchParams: () => mockParams,
  router: { push: (path: string) => mockPush(path) },
}));

const originalAdapter = api.defaults.adapter;

beforeEach(() => {
  store.dispatch(baseApi.util.resetApiState());
  mockPush.mockReset();
  mockParams = { label: "Revenue", category: "", property: "", properties: "", type: "revenue", from: "2026-01-01", to: "2026-12-31" };
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
});

async function show(): Promise<void> {
  await render(
    <Provider store={store}>
      <DrillDownScreen />
    </Provider>,
  );
}

describe("DrillDownScreen", () => {
  it("asks for approved transactions over the dates, one page at a time", async () => {
    const server = startTransactionServer([aTransaction({ id: "a", transaction_type: "income", category: "rental_revenue", vendor: "Guest" })]);
    await show();
    await screen.findByText("Guest");
    const asked = server.requests.find((request) => request.url === "/transactions/page")?.params as Record<string, unknown>;
    expect(asked).toMatchObject({ status: "approved", start_date: "2026-01-01", end_date: "2026-12-31", limit: DRILL_DOWN_PAGE_SIZE, offset: 0 });
  });

  it("asks the server for the summary's own rules: the kind's categories, in active properties only", async () => {
    const server = startTransactionServer([aTransaction({ id: "a", transaction_type: "income", category: "rental_revenue", vendor: "Guest" })]);
    await show();
    await screen.findByText("Guest");
    const asked = server.requests.find((request) => request.url === "/transactions/page")?.params as Record<string, unknown>;
    expect(asked).toMatchObject({ summary_kind: "revenue", active_properties_only: true });
  });

  it("counts deposits and uncategorised income as neither revenue nor expenses, as the summary does", async () => {
    startTransactionServer([
      aTransaction({ id: "rent", transaction_type: "income", category: "rental_revenue", vendor: "Guest", amount: "100.00" }),
      aTransaction({ id: "dep", transaction_type: "income", category: "security_deposit", vendor: "Deposit", amount: "500.00" }),
      aTransaction({ id: "un", transaction_type: "income", category: "uncategorized", vendor: "Mystery", amount: "7.00" }),
    ]);
    await show();
    await screen.findByText("Guest");
    expect(screen.queryByText("Deposit")).toBeNull();
    expect(screen.queryByText("Mystery")).toBeNull();
    expect(screen.getByText("1 transaction · $100.00")).toBeTruthy();
  });

  it("keeps to the categories the category filter left on", async () => {
    mockParams = { ...mockParams, type: "expenses", categories: "utilities" };
    startTransactionServer([
      aTransaction({ id: "u", category: "utilities", vendor: "Power Co", amount: "40.00" }),
      aTransaction({ id: "m", category: "maintenance", vendor: "Hardware", amount: "20.00" }),
    ]);
    await show();
    await screen.findByText("Power Co");
    expect(screen.queryByText("Hardware")).toBeNull();
    expect(screen.getByText("1 transaction · $40.00")).toBeTruthy();
  });

  it("loads the next page on scroll, with the server's count and total for every row from the first page on", async () => {
    const count = DRILL_DOWN_PAGE_SIZE * 2 + 5;
    const server = startTransactionServer(
      Array.from({ length: count }, (_, index) => aTransaction({ id: `r${index}`, transaction_type: "income", category: "rental_revenue", vendor: `Guest ${index}`, amount: "10.00" })),
    );
    const listed = () => (screen.getByTestId("drill-down-list").props.data as Transaction[]).map((row) => row.id);
    await show();
    await screen.findByText("Guest 0");
    expect(listed()).toHaveLength(DRILL_DOWN_PAGE_SIZE);
    expect(screen.getByText(`${count} transactions · $2,050.00`)).toBeTruthy();

    await fireEvent(screen.getByTestId("drill-down-list"), "onEndReached");
    await waitFor(() => expect(listed()).toContain(`r${DRILL_DOWN_PAGE_SIZE + 1}`));
    expect(screen.getByText(`${count} transactions · $2,050.00`)).toBeTruthy();
    const offsets = server.requests.filter((request) => request.url === "/transactions/page").map((request) => (request.params as { offset: number }).offset);
    expect(offsets).toEqual([0, DRILL_DOWN_PAGE_SIZE]);
  });

  it("keeps its rows when the next page fails, and says so", async () => {
    const server = startTransactionServer(
      Array.from({ length: DRILL_DOWN_PAGE_SIZE + 5 }, (_, index) => aTransaction({ id: `r${index}`, transaction_type: "income", category: "rental_revenue", vendor: `Guest ${index}` })),
    );
    await show();
    await screen.findByText("Guest 0");
    server.failListFromOffset = DRILL_DOWN_PAGE_SIZE;
    await fireEvent(screen.getByTestId("drill-down-list"), "onEndReached");
    await waitFor(() => expect(screen.getByRole("button", { name: /try again/i })).toBeTruthy());
    expect(screen.getByText("Guest 0")).toBeTruthy();
  });

  it("lists only the kind that was tapped, with how many and what they add up to", async () => {
    startTransactionServer([
      aTransaction({ id: "in1", transaction_type: "income", category: "rental_revenue", vendor: "Guest A", amount: "100.00" }),
      aTransaction({ id: "in2", transaction_type: "income", category: "rental_revenue", vendor: "Guest B", amount: "50.50" }),
      aTransaction({ id: "out", transaction_type: "expense", vendor: "Hardware", amount: "20.00" }),
    ]);
    await show();
    expect(await screen.findByText("Guest A")).toBeTruthy();
    expect(screen.getByText("Guest B")).toBeTruthy();
    expect(screen.queryByText("Hardware")).toBeNull();
    expect(screen.getByText("2 transactions · $150.50")).toBeTruthy();
    expect(screen.getByText("Revenue")).toBeTruthy();
  });

  it("only keeps the properties named", async () => {
    mockParams = { ...mockParams, type: "", properties: "p1" };
    startTransactionServer([aTransaction({ id: "a", property_id: "p1", vendor: "Mine" }), aTransaction({ id: "b", property_id: "p2", vendor: "Theirs" })]);
    await show();
    expect(await screen.findByText("Mine")).toBeTruthy();
    expect(screen.queryByText("Theirs")).toBeNull();
  });

  it("opens a transaction", async () => {
    startTransactionServer([aTransaction({ id: "in1", transaction_type: "income", category: "rental_revenue", vendor: "Guest A" })]);
    await show();
    await fireEvent.press(await screen.findByText("Guest A"));
    expect(mockPush).toHaveBeenCalledWith("/transactions/in1");
  });

  it("says there are none, not that it failed, when nothing matches", async () => {
    startTransactionServer([]);
    await show();
    expect(await screen.findByText(MESSAGES.noneHeading)).toBeTruthy();
    expect(screen.queryByText(MESSAGES.couldntLoad)).toBeNull();
  });

  it("shows a skeleton while loading", async () => {
    startTransactionServer([]).offline = false;
    api.defaults.adapter = () => new Promise(() => undefined);
    await show();
    expect(screen.queryByText(MESSAGES.noneHeading)).toBeNull();
    expect(screen.queryByText(MESSAGES.couldntLoad)).toBeNull();
  });

  it("tells a failure from an empty list, and Try again recovers", async () => {
    const server = startTransactionServer([aTransaction({ id: "in1", transaction_type: "income", category: "rental_revenue", vendor: "Guest A" })]);
    server.offline = true;
    await show();
    expect(await screen.findByText(MESSAGES.couldntLoad)).toBeTruthy();
    expect(screen.queryByText(MESSAGES.noneHeading)).toBeNull();
    server.offline = false;
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.tryAgain }));
    expect(await screen.findByText("Guest A")).toBeTruthy();
  });

  it("says minus out loud when a category holds only a refund", async () => {
    mockParams = { ...mockParams, type: "expenses", categories: "maintenance" };
    startTransactionServer([aTransaction({ id: "r", category: "maintenance", vendor: "Hardware", amount: "-45.00" })]);
    await show();
    await screen.findByText("Hardware");
    expect(screen.getByText("1 transaction · -$45.00")).toBeTruthy();
    expect(screen.getByLabelText("1 transaction, minus 45 dollars")).toBeTruthy();
  });

  it("shows no minus sign when amounts cancel out", async () => {
    mockParams = { ...mockParams, type: "expenses", categories: "maintenance" };
    startTransactionServer([
      aTransaction({ id: "a", category: "maintenance", vendor: "Hardware", amount: "0.10" }),
      aTransaction({ id: "b", category: "maintenance", vendor: "Plumber", amount: "0.20" }),
      aTransaction({ id: "c", category: "maintenance", vendor: "Refund", amount: "-0.30" }),
    ]);
    await show();
    await screen.findByText("Hardware");
    expect(screen.getByText("3 transactions · $0.00")).toBeTruthy();
  });

  it("keeps the last list with a notice when a refresh fails", async () => {
    const server = startTransactionServer([aTransaction({ id: "in1", transaction_type: "income", category: "rental_revenue", vendor: "Guest A" })]);
    await show();
    await screen.findByText("Guest A");
    server.offline = true;
    await act(async () => {
      await screen.getByTestId("drill-down-list").props.refreshControl.props.onRefresh();
    });
    expect(await screen.findByText(SHOWING_LAST_LOADED_MESSAGE)).toBeTruthy();
    expect(screen.getByText("Guest A")).toBeTruthy();
  });
});
