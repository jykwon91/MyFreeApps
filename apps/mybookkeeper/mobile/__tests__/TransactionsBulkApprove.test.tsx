import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
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

// Fresh each time: approving edits the rows the fake server holds.
const makeRows = () => [
  aTransaction({ id: "a", vendor: "Acme", status: "pending" }),
  aTransaction({ id: "b", vendor: "Bolt", status: "pending" }),
  aTransaction({ id: "c", vendor: "Cog", status: "pending" }),
  aTransaction({ id: "d", vendor: "Done", status: "approved" }),
  aTransaction({ id: "e", vendor: "Echo", status: "pending" }),
  aTransaction({ id: "f", vendor: "Fern", status: "pending", property_id: null }),
];

const isTicked = (name: RegExp) => screen.getByRole("checkbox", { name }).props.accessibilityState.checked as boolean;

async function selectAll() {
  await screen.findByText("Acme");
  await fireEvent.press(screen.getByRole("button", { name: "Select several transactions" }));
  await fireEvent.press(screen.getByRole("button", { name: "Select all the transactions shown" }));
}

describe("approving several transactions at once", () => {
  it("keeps every tick, approvable or not, when approving fails", async () => {
    const server = startTransactionServer(makeRows());
    server.failWritesWith = 500;
    await renderScreen();
    await selectAll();
    await fireEvent.press(screen.getByRole("button", { name: "Approve 4 selected" }));
    expect(await screen.findByText("I couldn't approve those. Want to try again?")).toBeTruthy();
    expect(screen.getByText("6 selected")).toBeTruthy();
    for (const vendor of [/Acme/, /Bolt/, /Cog/, /Done/, /Echo/, /Fern/]) expect(isTicked(vendor)).toBe(true);
  });

  it("unticks only what was approved when a later batch fails, and keeps the rest", async () => {
    const server = startTransactionServer(makeRows());
    server.bulkApprovesBeforeFailing = 1;
    await renderScreen();
    await selectAll();
    await fireEvent.press(screen.getByRole("button", { name: "Approve 4 selected" }));
    expect(await screen.findByText("Approved 2. The rest failed — try again.")).toBeTruthy();
    expect(await screen.findByText("4 selected")).toBeTruthy();
    expect(isTicked(/Acme/)).toBe(false);
    expect(isTicked(/Bolt/)).toBe(false);
    for (const vendor of [/Cog/, /Done/, /Echo/, /Fern/]) expect(isTicked(vendor)).toBe(true);
  });

  it("counts ids the server skipped as through, so they leave the selection", async () => {
    const server = startTransactionServer(makeRows());
    await renderScreen();
    await selectAll();
    // Approved elsewhere since this list loaded: the server skips it.
    server.transactions = server.transactions.map((row) => (row.id === "a" ? { ...row, status: "approved" } : row));
    await fireEvent.press(screen.getByRole("button", { name: "Approve 4 selected" }));
    expect(await screen.findByText("3 approved, 1 skipped")).toBeTruthy();
    await waitFor(() => expect(screen.queryByText(/selected$/)).toBeNull());
  });

  it("keeps Cancel above the Delete and Approve pair, so their busy labels have half the width each", async () => {
    startTransactionServer(makeRows());
    await renderScreen();
    await fireEvent(await screen.findByLabelText(/Acme/), "longPress");
    const pair = within(screen.getByTestId("bulk-action-row"));
    expect(pair.getByRole("button", { name: "Delete 1 selected" })).toBeTruthy();
    expect(pair.getByRole("button", { name: "Approve 1 selected" })).toBeTruthy();
    expect(pair.queryByRole("button", { name: "Stop selecting" })).toBeNull();
  });
});

describe("ticks follow their rows", () => {
  it("drops the tick of a row that disappears on refresh, so it isn't ticked when it comes back", async () => {
    const server = startTransactionServer(makeRows());
    await renderScreen();
    await fireEvent(await screen.findByLabelText(/Acme/), "longPress");
    await fireEvent.press(screen.getByRole("checkbox", { name: /Bolt/ }));
    expect(screen.getByText("2 selected")).toBeTruthy();
    const original = server.transactions;
    server.transactions = original.filter((row) => row.id !== "a");
    await act(async () => {
      await screen.getByTestId("transactions-list").props.refreshControl.props.onRefresh();
    });
    expect(await screen.findByText("1 selected")).toBeTruthy();
    server.transactions = original;
    await act(async () => {
      await screen.getByTestId("transactions-list").props.refreshControl.props.onRefresh();
    });
    await screen.findByText("Acme");
    expect(screen.getByText("1 selected")).toBeTruthy();
    expect(isTicked(/Acme/)).toBe(false);
    expect(isTicked(/Bolt/)).toBe(true);
  });
});
