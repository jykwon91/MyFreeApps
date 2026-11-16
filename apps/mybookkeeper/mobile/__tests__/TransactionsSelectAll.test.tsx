import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
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

// Two rows a page, so "more than is loaded" is a handful of rows.
jest.mock("@mybookkeeper/api-client/constants/transactionPaging", () => ({
  ...jest.requireActual("@mybookkeeper/api-client/constants/transactionPaging"),
  TRANSACTION_PAGE_SIZE: 2,
}));
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
  const [filters, setFilters] = useState<TransactionFilters>({ ...NO_FILTERS, view: "review" });
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

// Five waiting for review, one approved (outside the To review filter), one with no property.
const makeRows = () => [
  aTransaction({ id: "a", vendor: "Acme", status: "pending" }),
  aTransaction({ id: "b", vendor: "Bolt", status: "pending" }),
  aTransaction({ id: "c", vendor: "Cog", status: "needs_review" }),
  aTransaction({ id: "d", vendor: "Done", status: "approved" }),
  aTransaction({ id: "e", vendor: "Echo", status: "pending" }),
  aTransaction({ id: "f", vendor: "Fern", status: "pending", property_id: null }),
];

const SELECT_ALL = "Select every transaction that matches";

const selectionRequests = (requests: { url?: string; params?: unknown }[]) =>
  requests.filter((request) => request.url === "/transactions/selection");

async function startSelectingAll() {
  await screen.findByText("Acme");
  await fireEvent.press(screen.getByRole("button", { name: "Select several transactions" }));
  await fireEvent.press(screen.getByRole("button", { name: SELECT_ALL }));
}

describe("selecting every matching transaction", () => {
  it("ticks the matching ones not loaded yet, with the list's filters, and approves them all", async () => {
    const server = startTransactionServer(makeRows());
    await renderScreen();
    await startSelectingAll();
    expect(await screen.findByText("5 selected")).toBeTruthy();
    // Only the first page is on screen.
    expect(screen.queryByText("Echo")).toBeNull();
    const [request] = selectionRequests(server.requests);
    expect(request?.params).toMatchObject({ to_review: true });
    expect(screen.getByText(/1 of these can't be approved here/)).toBeTruthy();
    expect(screen.getByRole("button", { name: SELECT_ALL }).props.accessibilityState).toMatchObject({ disabled: true });

    await fireEvent.press(screen.getByRole("button", { name: "Approve 4 selected" }));
    expect(await screen.findByText("4 approved")).toBeTruthy();
    const approve = server.requests.find((r) => r.url === "/transactions/bulk-approve");
    expect((JSON.parse(String(approve?.data)) as { ids: string[] }).ids.sort()).toEqual(["a", "b", "c", "e"]);
  });

  it("shows loading on Select all while the matching rows are on their way", async () => {
    startTransactionServer(makeRows());
    const served = api.defaults.adapter as AxiosAdapter;
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    api.defaults.adapter = (config) =>
      String(config.url).startsWith("/transactions/selection") ? held.then(() => served(config)) : served(config);
    await renderScreen();
    await startSelectingAll();
    expect(screen.getByText("Selecting…")).toBeTruthy();
    expect(screen.getByRole("button", { name: SELECT_ALL }).props.accessibilityState).toMatchObject({ disabled: true });
    await act(async () => release());
    expect(await screen.findByText("5 selected")).toBeTruthy();
  });

  it("selects nothing and says so when the matching rows can't be fetched", async () => {
    const server = startTransactionServer(makeRows());
    server.failSelectionWith = 500;
    await renderScreen();
    await startSelectingAll();
    expect(await screen.findByText("I couldn't select every matching transaction. Try again.")).toBeTruthy();
    expect(screen.getByText("0 selected")).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: /Acme/ }).props.accessibilityState).toMatchObject({ checked: false });
    expect(screen.getByRole("button", { name: SELECT_ALL }).props.accessibilityState).toMatchObject({ disabled: false });
  });

  it("clears the selection when the filters change", async () => {
    startTransactionServer(makeRows());
    await renderScreen();
    await startSelectingAll();
    await screen.findByText("5 selected");
    await fireEvent.press(screen.getByRole("tab", { name: "All" }));
    await waitFor(() => expect(screen.queryByText(/selected$/)).toBeNull());
    expect(screen.getByRole("button", { name: "Select several transactions" })).toBeTruthy();
  });

  it("unticks a row not loaded on screen that's gone after a refresh", async () => {
    const server = startTransactionServer(makeRows());
    await renderScreen();
    await startSelectingAll();
    await screen.findByText("5 selected");
    server.transactions = server.transactions.filter((row) => row.id !== "e");
    await act(async () => {
      await screen.getByTestId("transactions-list").props.refreshControl.props.onRefresh();
    });
    expect(await screen.findByText("4 selected")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delete 4 selected" }).props.accessibilityState).toMatchObject({ disabled: false });
  });
});
