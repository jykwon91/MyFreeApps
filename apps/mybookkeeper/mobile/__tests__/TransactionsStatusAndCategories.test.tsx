import type { TransactionListParams } from "@mybookkeeper/api-client/types/transaction/TransactionListParams";
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import { useState } from "react";
import { Provider } from "react-redux";
import { NO_FILTERS } from "../src/constants/transactionFilters";
import { monthLink } from "../src/features/home/homeLinks";
import TransactionsScreen from "../src/features/transactions/TransactionsScreen";
import { filtersFromParams } from "../src/features/transactions/transactionFilters";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";
import type { MoneyParams } from "../src/types/MoneyParams";
import type { TransactionFilters } from "../src/types/TransactionFilters";
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

const listParams = (server: FakeTransactionServer): TransactionListParams[] =>
  server.requests.filter((request) => request.url === "/transactions/page").map((request) => (request.params ?? {}) as TransactionListParams);

/** The filters a link opens the Money tab with, read back the way the tab reads its address. */
function arrivingFrom(link: string): TransactionFilters {
  const query = new URLSearchParams(link.split("?")[1]);
  return filtersFromParams(Object.fromEntries(query.entries()) as Partial<MoneyParams>);
}

function rows() {
  return [
    aTransaction({ id: "a", vendor: "Approved one", status: "approved", transaction_date: "2026-03-02" }),
    aTransaction({ id: "n", vendor: "Needs a look", status: "needs_review", transaction_date: "2026-03-03" }),
    aTransaction({ id: "u", vendor: "Unverified one", status: "unverified", transaction_date: "2026-03-04" }),
    aTransaction({ id: "d", vendor: "Deposit", status: "approved", category: "security_deposit", transaction_type: "income", transaction_date: "2026-03-05" }),
  ];
}

describe("Transactions status filter", () => {
  it("narrows to one status the sheet offers, as the website's Status filter does", async () => {
    const server = startTransactionServer(rows());
    await renderScreen();
    await screen.findByText("Needs a look");

    await fireEvent.press(screen.getByRole("button", { name: "Filters" }));
    expect(screen.getByRole("radio", { name: "Any status" }).props.accessibilityState).toEqual(expect.objectContaining({ checked: true }));
    for (const label of ["Pending", "Approved", "Needs Review", "Duplicate", "Unverified"]) {
      expect(screen.getByRole("radio", { name: label })).toBeTruthy();
    }
    await fireEvent.press(screen.getByRole("radio", { name: "Unverified" }));
    await fireEvent.press(screen.getByRole("button", { name: "Show results" }));

    expect(await screen.findByText("1 transaction · Unverified")).toBeTruthy();
    expect(screen.getByText("Unverified one")).toBeTruthy();
    expect(screen.queryByText("Needs a look")).toBeNull();
    expect(listParams(server)).toContainEqual(expect.objectContaining({ status: "unverified" }));
    expect(screen.getByRole("button", { name: "Filters, 1 on" })).toBeTruthy();
  });

  it("shows Approved selected after a link from Home, and Clear all takes it off", async () => {
    const server = startTransactionServer(rows());
    await renderScreen(arrivingFrom(monthLink("2026-03", {})));
    await screen.findByText("Approved one");
    expect(screen.queryByText("Needs a look")).toBeNull();
    expect(listParams(server)).toContainEqual(expect.objectContaining({ status: "approved" }));

    await fireEvent.press(screen.getByRole("button", { name: "Filters, 2 on" }));
    expect(screen.getByRole("radio", { name: "Approved" }).props.accessibilityState).toEqual(expect.objectContaining({ checked: true }));
    await fireEvent.press(screen.getByRole("button", { name: "Clear all" }));
    expect(screen.getByRole("radio", { name: "Any status" }).props.accessibilityState).toEqual(expect.objectContaining({ checked: true }));
    await fireEvent.press(screen.getByRole("button", { name: "Show results" }));

    expect(await screen.findByText("Needs a look")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Filters" })).toBeTruthy();
  });

  it("leaves status out of the To review view, which is every row waiting whatever its status", async () => {
    const server = startTransactionServer(rows());
    await renderScreen({ ...NO_FILTERS, view: "review", status: "approved" });
    await screen.findByText("Needs a look");

    expect(listParams(server).every((params) => params.status === undefined && params.to_review === true)).toBe(true);
    await fireEvent.press(screen.getByRole("button", { name: "Filters" }));
    expect(screen.queryByRole("radio", { name: "Any status" })).toBeNull();
  });
});

describe("Transactions category filter", () => {
  it("offers the categories the matching rows have, security deposits included", async () => {
    startTransactionServer(rows());
    await renderScreen();
    await screen.findByText("Deposit");

    await fireEvent.press(screen.getByRole("button", { name: "Filters" }));
    expect(await screen.findByRole("radio", { name: "Security Deposit" })).toBeTruthy();
    // Nothing is tagged utilities, so it isn't offered.
    expect(screen.queryByRole("radio", { name: "Utilities" })).toBeNull();

    await fireEvent.press(screen.getByRole("radio", { name: "Security Deposit" }));
    await fireEvent.press(screen.getByRole("button", { name: "Show results" }));
    expect(await screen.findByText("1 transaction · Security Deposit")).toBeTruthy();
    expect(screen.getByText("Deposit")).toBeTruthy();
    expect(screen.queryByText("Approved one")).toBeNull();
  });

  it("follows the other choices in the sheet, keeping the chosen category on offer", async () => {
    const server = startTransactionServer(rows());
    await renderScreen({ ...NO_FILTERS, category: "security_deposit" });
    await screen.findByText("Deposit");

    await fireEvent.press(screen.getByRole("button", { name: "Filters, 1 on" }));
    await fireEvent.press(screen.getByRole("radio", { name: "Needs Review" }));

    await waitFor(() =>
      expect(server.requests).toContainEqual(
        expect.objectContaining({ url: "/transactions/categories", params: expect.objectContaining({ status: "needs_review" }) }),
      ),
    );
    await waitFor(() => expect(screen.getByRole("radio", { name: "Maintenance" })).toBeTruthy());
    expect(screen.getByRole("radio", { name: "Security Deposit" }).props.accessibilityState).toEqual(expect.objectContaining({ checked: true }));
  });

  it("falls back to every category of the type when the list of categories can't load", async () => {
    const server = startTransactionServer(rows());
    server.failCategoriesWith = 500;
    await renderScreen();
    await screen.findByText("Deposit");

    await fireEvent.press(screen.getByRole("button", { name: "Filters" }));
    await waitFor(() => expect(server.requests.some((request) => request.url === "/transactions/categories")).toBe(true));
    expect(screen.getByRole("radio", { name: "Utilities" })).toBeTruthy();
  });
});

describe("Transactions count", () => {
  it("says how many transactions match, counting every page rather than the rows loaded", async () => {
    startTransactionServer(Array.from({ length: 53 }, (_, index) => aTransaction({ id: `t${index}`, vendor: `Vendor ${index}` })));
    await renderScreen();
    await screen.findByText("Vendor 0");

    expect(screen.getByTestId("transactions-list").props.data).toHaveLength(50);
    expect(within(screen.getByTestId("transactions-list")).getByText("53 transactions")).toBeTruthy();
  });
});
