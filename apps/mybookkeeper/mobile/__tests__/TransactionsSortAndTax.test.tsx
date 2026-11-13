import type { TransactionListParams } from "@mybookkeeper/api-client/types/transaction/TransactionListParams";
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { AxiosAdapter } from "axios";
import { useState } from "react";
import { Provider } from "react-redux";
import { NO_FILTERS } from "../src/constants/transactionFilters";
import TransactionsScreen from "../src/features/transactions/TransactionsScreen";
import type { TransactionFilters } from "../src/types/TransactionFilters";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";
import { aTransaction, startTransactionServer, type FakeTransactionServer } from "../test-support/transactionsServer";

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = jest.requireActual("react");
    useEffect(callback, [callback]);
  },
}));

const originalAdapter = api.defaults.adapter;

beforeEach(() => {
  session.tokenStore.set("token");
  store.dispatch(baseApi.util.resetApiState());
  store.dispatch(workspaceChosen("w1"));
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
});

function Harness({ initial }: { initial: TransactionFilters }) {
  const [filters, setFilters] = useState(initial);
  return (
    <TransactionsScreen
      filters={filters}
      onFiltersChange={setFilters}
      onVendorChange={(vendor) => setFilters((current) => ({ ...current, vendor }))}
    />
  );
}

async function renderScreen(initial: TransactionFilters = NO_FILTERS) {
  await render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>
        <Harness initial={initial} />
      </ToastProvider>
    </Provider>,
  );
}

function threeRows(): FakeTransactionServer {
  return startTransactionServer([
    aTransaction({ id: "mid", vendor: "Mid", amount: "50.00", tax_relevant: true }),
    aTransaction({ id: "big", vendor: "Big", amount: "500.00", tax_relevant: false }),
    aTransaction({ id: "small", vendor: "Small", amount: "5.00", tax_relevant: true }),
  ]);
}

const listParams = (server: FakeTransactionServer): TransactionListParams[] =>
  server.requests.filter((request) => request.url === "/transactions").map((request) => (request.params ?? {}) as TransactionListParams);

const shownVendors = (): string[] =>
  (screen.getByTestId("transactions-list").props.data as { vendor: string }[]).map((row) => row.vendor);

async function sortBy(field: string, direction: string): Promise<void> {
  await fireEvent.press(screen.getByRole("button", { name: /^Filters/ }));
  await fireEvent.press(screen.getByRole("radio", { name: field }));
  await fireEvent.press(screen.getByRole("radio", { name: direction }));
  await fireEvent.press(screen.getByRole("button", { name: "Show results" }));
}

describe("Transactions sort and tax filter", () => {
  it("asks the server for the chosen order and shows the rows in it, without counting it as a filter", async () => {
    const server = threeRows();
    await renderScreen();
    await screen.findByText("Mid");
    expect(listParams(server)[0]).not.toHaveProperty("sort_by");

    await sortBy("Amount", "Ascending");

    await waitFor(() => expect(shownVendors()).toEqual(["Small", "Mid", "Big"]));
    expect(listParams(server)).toContainEqual(expect.objectContaining({ sort_by: "amount", sort_dir: "asc" }));
    expect(screen.getByText("Amount, ascending")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Filters" })).toBeTruthy();
  });

  it("shows the loading rows while a new order is on its way", async () => {
    threeRows();
    await renderScreen();
    await screen.findByText("Mid");
    const answer = api.defaults.adapter as AxiosAdapter;
    api.defaults.adapter = (config) =>
      (config.params as TransactionListParams | undefined)?.sort_by ? new Promise(() => undefined) : answer(config);

    await sortBy("Vendor", "Descending");

    expect(await screen.findByTestId("transactions-skeleton")).toBeTruthy();
    expect(screen.queryByText("Mid")).toBeNull();
  });

  it("keeps the order when the list is refreshed", async () => {
    const server = threeRows();
    await renderScreen();
    await screen.findByText("Mid");
    await sortBy("Amount", "Descending");
    await waitFor(() => expect(shownVendors()).toEqual(["Big", "Mid", "Small"]));
    const before = listParams(server).length;

    await act(async () => {
      await screen.getByTestId("transactions-list").props.refreshControl.props.onRefresh();
    });

    const after = listParams(server).slice(before);
    expect(after.length).toBeGreaterThan(0);
    expect(after.every((params) => params.sort_by === "amount" && params.sort_dir === "desc")).toBe(true);
    expect(shownVendors()).toEqual(["Big", "Mid", "Small"]);
  });

  it("narrows to what's in the tax report, counts it, says so, and clears it", async () => {
    const server = threeRows();
    await renderScreen();
    await screen.findByText("Big");

    await fireEvent.press(screen.getByRole("button", { name: "Filters" }));
    await fireEvent.press(screen.getByRole("radio", { name: "Yes" }));
    await fireEvent.press(screen.getByRole("button", { name: "Show results" }));

    await waitFor(() => expect(screen.queryByText("Big")).toBeNull());
    expect(screen.getByText("Mid")).toBeTruthy();
    expect(listParams(server)).toContainEqual(expect.objectContaining({ tax_relevant: true }));
    expect(screen.getByRole("button", { name: "Filters, 1 on" })).toBeTruthy();
    expect(screen.getByText("In tax report")).toBeTruthy();

    await fireEvent.press(screen.getByRole("button", { name: "Clear" }));
    expect(await screen.findByText("Big")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Filters" })).toBeTruthy();
  });

  it("says when nothing is left out of the tax report, and clearing brings back every row in the usual order", async () => {
    startTransactionServer([aTransaction({ id: "a", vendor: "Counts", tax_relevant: true })]);
    await renderScreen({ ...NO_FILTERS, sortBy: "vendor", sortDir: "asc" });
    await screen.findByText("Counts");

    await fireEvent.press(screen.getByRole("button", { name: "Filters" }));
    await fireEvent.press(screen.getByRole("radio", { name: "No" }));
    await fireEvent.press(screen.getByRole("button", { name: "Show results" }));

    expect(await screen.findByText("Nothing matches that")).toBeTruthy();
    expect(screen.getByText("Not in tax report · Vendor, ascending")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Clear filters" }));
    expect(await screen.findByText("Counts")).toBeTruthy();
    expect(screen.queryByText(/Vendor, ascending/)).toBeNull();
  });

  it("puts the tax choice and the order back to their defaults on Clear all", async () => {
    const server = threeRows();
    await renderScreen({ ...NO_FILTERS, taxRelevant: "false", sortBy: "amount", sortDir: "asc" });
    await screen.findByText("Big");

    await fireEvent.press(screen.getByRole("button", { name: "Filters, 1 on" }));
    expect(screen.getByRole("radio", { name: "Amount" }).props.accessibilityState).toEqual(expect.objectContaining({ checked: true }));
    await fireEvent.press(screen.getByRole("button", { name: "Clear all" }));
    expect(screen.getByRole("radio", { name: "Either" }).props.accessibilityState).toEqual(expect.objectContaining({ checked: true }));
    expect(screen.getByRole("radio", { name: "Date" }).props.accessibilityState).toEqual(expect.objectContaining({ checked: true }));
    expect(screen.getByRole("radio", { name: "Descending" }).props.accessibilityState).toEqual(expect.objectContaining({ checked: true }));
    await fireEvent.press(screen.getByRole("button", { name: "Show results" }));

    expect(await screen.findByText("Mid")).toBeTruthy();
    const last = listParams(server).at(-1);
    expect(last).not.toHaveProperty("tax_relevant");
    expect(last).not.toHaveProperty("sort_by");
  });

  it("keeps the review queue newest first: no order to pick, and none sent", async () => {
    const server = startTransactionServer([aTransaction({ status: "pending", tax_relevant: true })]);
    await renderScreen({ ...NO_FILTERS, view: "review", sortBy: "amount", sortDir: "asc" });
    await screen.findByText("Home Depot");

    expect(listParams(server).every((params) => params.sort_by === undefined)).toBe(true);
    await fireEvent.press(screen.getByRole("button", { name: "Filters" }));
    expect(screen.queryByRole("radio", { name: "Amount" })).toBeNull();
    expect(screen.getByRole("radio", { name: "Yes" })).toBeTruthy();
  });

  it("leaves the review queue's hidden order alone on Clear all, and when clearing filters", async () => {
    startTransactionServer([aTransaction({ status: "pending", tax_relevant: true })]);
    const seen = jest.fn<void, [TransactionFilters]>();
    function Spy() {
      const [filters, setFilters] = useState<TransactionFilters>({ ...NO_FILTERS, view: "review", sortBy: "amount", sortDir: "asc", taxRelevant: "true" });
      return <TransactionsScreen filters={filters} onFiltersChange={(next) => { seen(next); setFilters(next); }} onVendorChange={() => undefined} />;
    }
    await render(
      <Provider store={store}>
        <ToastProvider bottomOffset={0}>
          <Spy />
        </ToastProvider>
      </Provider>,
    );
    await screen.findByText("Home Depot");

    await fireEvent.press(screen.getByRole("button", { name: "Filters, 1 on" }));
    await fireEvent.press(screen.getByRole("button", { name: "Clear all" }));
    await fireEvent.press(screen.getByRole("button", { name: "Show results" }));

    await waitFor(() => expect(seen).toHaveBeenCalled());
    expect(seen.mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({ view: "review", sortBy: "amount", sortDir: "asc", taxRelevant: null }));
  });
});
