import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { AxiosAdapter } from "axios";
import { useState } from "react";
import { Provider } from "react-redux";
import { NO_FILTERS } from "../src/constants/transactionFilters";
import TransactionsScreen from "../src/features/transactions/TransactionsScreen";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";
import type { TransactionFilters } from "../src/types/TransactionFilters";
import { aTransaction, startTransactionServer } from "../test-support/transactionsServer";

// Two ids a request, so batching over "more than the server takes" is a handful of rows on screen.
jest.mock("@mybookkeeper/api-client/constants/transactionBulk", () => ({ MAX_BULK_TRANSACTION_IDS: 2 }));
jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = jest.requireActual("react");
    useEffect(callback, [callback]);
  },
}));
jest.mock("@react-native-community/datetimepicker", () => {
  const { View } = jest.requireActual("react-native");
  return { __esModule: true, default: View, DateTimePickerAndroid: { open: jest.fn() } };
});

const originalAdapter = api.defaults.adapter;

beforeEach(() => {
  session.tokenStore.set("token");
  store.dispatch(baseApi.util.resetApiState());
  store.dispatch(workspaceChosen("w1"));
  jest.clearAllMocks();
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
});

function Harness() {
  const [filters, setFilters] = useState<TransactionFilters>(NO_FILTERS);
  return <TransactionsScreen filters={filters} onFiltersChange={setFilters} onVendorChange={() => undefined} />;
}

async function renderScreen() {
  await render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>
        <Harness />
      </ToastProvider>
    </Provider>,
  );
}

const makeRows = () => [
  aTransaction({ id: "a", vendor: "Acme" }),
  aTransaction({ id: "b", vendor: "Bolt" }),
  aTransaction({ id: "c", vendor: "Cog" }),
  aTransaction({ id: "r", vendor: "Rent", transaction_type: "income", category: "rental_revenue" }),
];

const MARK = /^Mark capital improvement, \d+ selected$/;
const UNMARK = /^Unmark capital improvement, \d+ selected$/;
const isTicked = (name: RegExp) => screen.getByRole("checkbox", { name }).props.accessibilityState.checked as boolean;

async function selectAll() {
  await screen.findByText("Acme");
  await fireEvent.press(screen.getByRole("button", { name: "Select several transactions" }));
  await fireEvent.press(screen.getByRole("button", { name: "Select every transaction that matches" }));
  await waitFor(() => expect(screen.queryByText("Selecting…")).toBeNull());
}

describe("marking several transactions as capital improvements at once", () => {
  it("marks every ticked expense, shows the badge, and says what was skipped", async () => {
    const server = startTransactionServer(makeRows());
    await renderScreen();
    await selectAll();
    await fireEvent.press(screen.getByRole("button", { name: MARK }));
    expect(await screen.findByText("Marked 3 transactions, 1 skipped (only expenses can be marked)")).toBeTruthy();
    expect(server.transactions.filter((row) => row.is_capital_improvement).map((row) => row.id)).toEqual(["a", "b", "c"]);
    await waitFor(() => expect(screen.getAllByText("Capital improvement")).toHaveLength(3));
    await waitFor(() => expect(screen.queryByText(/selected$/)).toBeNull());
  });

  it("unmarks the ticked expenses and drops their badge", async () => {
    const server = startTransactionServer(makeRows().map((row) => ({ ...row, is_capital_improvement: row.transaction_type === "expense" })));
    await renderScreen();
    await selectAll();
    await fireEvent.press(screen.getByRole("button", { name: UNMARK }));
    expect(await screen.findByText("Unmarked 3 transactions, 1 skipped (only expenses can be marked)")).toBeTruthy();
    expect(server.transactions.some((row) => row.is_capital_improvement)).toBe(false);
    await waitFor(() => expect(screen.queryByText("Capital improvement")).toBeNull());
  });

  it("keeps every tick and says so when nothing went through", async () => {
    const server = startTransactionServer(makeRows());
    server.failWritesWith = 500;
    await renderScreen();
    await selectAll();
    await fireEvent.press(screen.getByRole("button", { name: MARK }));
    expect(await screen.findByText("I couldn't mark those. Want to try again?")).toBeTruthy();
    expect(await screen.findByText("4 selected")).toBeTruthy();
    expect(screen.queryByText("Capital improvement")).toBeNull();
  });

  it("unticks only what went through when a later batch fails", async () => {
    const server = startTransactionServer(makeRows());
    server.bulkCapitalBeforeFailing = 1;
    await renderScreen();
    await selectAll();
    await fireEvent.press(screen.getByRole("button", { name: MARK }));
    expect(await screen.findByText("Marked 2. The rest failed — try again.")).toBeTruthy();
    expect(await screen.findByText("2 selected")).toBeTruthy();
    expect(isTicked(/Acme/)).toBe(false);
    expect(isTicked(/Bolt/)).toBe(false);
    expect(isTicked(/Cog/)).toBe(true);
    expect(isTicked(/Rent/)).toBe(true);
  });

  it("shows a busy label on the pressed button and disables the others while it runs", async () => {
    const server = startTransactionServer(makeRows());
    await renderScreen();
    await selectAll();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const answer = api.defaults.adapter as AxiosAdapter;
    api.defaults.adapter = async (config) => {
      if (config.url === "/transactions/bulk-capital-improvement") await gate;
      return answer(config);
    };
    await fireEvent.press(screen.getByRole("button", { name: MARK }));
    expect(await screen.findByText("Marking...")).toBeTruthy();
    expect(screen.getByRole("button", { name: UNMARK }).props.accessibilityState.disabled).toBe(true);
    expect(screen.getByRole("button", { name: "Delete 4 selected" }).props.accessibilityState.disabled).toBe(true);
    expect(screen.getByRole("button", { name: "Stop selecting" }).props.accessibilityState.disabled).toBe(true);
    release();
    expect(await screen.findByText(/^Marked 3 transactions/)).toBeTruthy();
    expect(server.transactions.filter((row) => row.is_capital_improvement)).toHaveLength(3);
  });
});
