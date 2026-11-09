import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { useState } from "react";
import { Pressable } from "react-native";
import { Provider } from "react-redux";
import { NO_FILTERS } from "../src/constants/transactionFilters";
import TransactionsScreen from "../src/features/transactions/TransactionsScreen";
import type { TransactionFilters } from "../src/types/TransactionFilters";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";
import { aProperty, aTransaction, startTransactionServer } from "../test-support/transactionsServer";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  router: { push: (path: string) => mockPush(path) },
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
  jest.clearAllMocks();
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

function ControlledFromOutside() {
  const [filters, setFilters] = useState<TransactionFilters>({ ...NO_FILTERS, vendor: "acme" });
  return (
    <>
      <Pressable accessibilityLabel="follow a link" accessibilityRole="button" onPress={() => setFilters(NO_FILTERS)} />
      <TransactionsScreen
        filters={filters}
        onFiltersChange={setFilters}
        onVendorChange={(vendor) => setFilters((current) => ({ ...current, vendor }))}
      />
    </>
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

const pageOf = (count: number, prefix = "t") =>
  Array.from({ length: count }, (_, index) => aTransaction({ id: `${prefix}${index}`, vendor: `Vendor ${prefix}${index}` }));

describe("TransactionsScreen", () => {
  it("shows a row with its money and its property, and opens it", async () => {
    startTransactionServer([aTransaction()], [aProperty()]);
    await renderScreen();
    expect(await screen.findByText("Home Depot")).toBeTruthy();
    expect(screen.getByText("\u2212$84.20")).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/Oak Street/)).toBeTruthy());
    await fireEvent.press(screen.getByLabelText(/Maintenance expense, Home Depot/));
    expect(mockPush).toHaveBeenCalledWith("/transactions/t1");
  });

  it("marks a row that needs review and opens it in review mode", async () => {
    startTransactionServer([aTransaction({ status: "needs_review" })]);
    await renderScreen({ ...NO_FILTERS, view: "review" });
    expect(await screen.findByText("Needs review")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText(/Home Depot/));
    expect(mockPush).toHaveBeenCalledWith("/transactions/t1?review=1");
  });

  it("takes the filters along into review, so the next one comes from the same list", async () => {
    startTransactionServer([aTransaction({ status: "pending" })]);
    await renderScreen({ ...NO_FILTERS, view: "review", type: "expense", propertyId: "p1" });
    await fireEvent.press(await screen.findByLabelText(/Home Depot/));
    expect(mockPush).toHaveBeenCalledWith("/transactions/t1?review=1&type=expense&property=p1");
  });

  it("switches to what's waiting for review and asks the server for just those", async () => {
    const server = startTransactionServer([aTransaction({ id: "a", vendor: "Done" }), aTransaction({ id: "b", vendor: "Waiting", status: "pending" })]);
    await renderScreen();
    await screen.findByText("Done");
    await fireEvent.press(screen.getByRole("tab", { name: "To review" }));
    await waitFor(() => expect(screen.queryByText("Done")).toBeNull());
    expect(screen.getByText("Waiting")).toBeTruthy();
    expect(server.requests.some((request) => (request.params as { to_review?: boolean } | undefined)?.to_review === true)).toBe(true);
  });

  it("searches by vendor", async () => {
    startTransactionServer([aTransaction({ id: "a", vendor: "Acme" }), aTransaction({ id: "b", vendor: "Home Depot" })]);
    await renderScreen();
    await screen.findByText("Acme");
    await fireEvent.changeText(screen.getByLabelText("Search transactions by vendor"), "acme");
    await waitFor(() => {
      expect(screen.queryByText("Home Depot")).toBeNull();
      expect(screen.getByText("Acme")).toBeTruthy();
    });
  });

  it("says when a search finds nothing, and clears it", async () => {
    startTransactionServer([aTransaction()]);
    await renderScreen();
    await screen.findByText("Home Depot");
    await fireEvent.changeText(screen.getByLabelText("Search transactions by vendor"), "zzz");
    expect(await screen.findByText("Nothing matches that")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Clear filters" }));
    expect(await screen.findByText("Home Depot")).toBeTruthy();
  });

  it("applies filters from the sheet only on Show results, then counts and clears them", async () => {
    const server = startTransactionServer([aTransaction()]);
    await renderScreen();
    await screen.findByText("Home Depot");
    await fireEvent.press(screen.getByRole("button", { name: "Filters" }));
    await fireEvent.press(screen.getByRole("radio", { name: "Income" }));
    const askedForIncome = () =>
      server.requests.some((request) => (request.params as { transaction_type?: string } | undefined)?.transaction_type === "income");
    expect(askedForIncome()).toBe(false);
    await fireEvent.press(screen.getByRole("button", { name: "Show results" }));
    expect(await screen.findByRole("button", { name: "Filters, 1 on" })).toBeTruthy();
    await waitFor(() => expect(askedForIncome()).toBe(true));
    await fireEvent.press(screen.getByRole("button", { name: "Clear" }));
    expect(await screen.findByRole("button", { name: "Filters" })).toBeTruthy();
  });

  it("drops what was picked when the filter sheet is closed", async () => {
    startTransactionServer([aTransaction()]);
    await renderScreen();
    await screen.findByText("Home Depot");
    await fireEvent.press(screen.getByRole("button", { name: "Filters" }));
    await fireEvent.press(screen.getByRole("radio", { name: "Income" }));
    await fireEvent.press(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByRole("button", { name: "Filters" })).toBeTruthy();
  });

  it("loads the next page at the end of the list", async () => {
    startTransactionServer([...pageOf(50), aTransaction({ id: "last", vendor: "Page two" })]);
    await renderScreen();
    await screen.findByText("Vendor t0");
    await act(async () => {
      screen.getByTestId("transactions-list").props.onEndReached();
    });
    await waitFor(() => expect(screen.getByTestId("transactions-list").props.data).toHaveLength(51));
  });

  it("offers a retry when the next page fails, and keeps what's loaded", async () => {
    const server = startTransactionServer([...pageOf(50), aTransaction({ id: "last" })]);
    server.failListFromOffset = 50;
    await renderScreen();
    await screen.findByText("Vendor t0");
    await act(async () => {
      screen.getByTestId("transactions-list").props.onEndReached();
    });
    expect(await screen.findByText("I couldn't load more.")).toBeTruthy();
    expect(screen.getByText("Vendor t0")).toBeTruthy();
    server.failListFromOffset = null;
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByTestId("transactions-list").props.data).toHaveLength(51));
    expect(screen.queryByText("I couldn't load more.")).toBeNull();
  });

  it("invites someone who can write to take a photo when there's nothing yet", async () => {
    startTransactionServer([]);
    await renderScreen();
    expect(await screen.findByText("No transactions yet")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Take a photo" }));
    expect(mockPush).toHaveBeenCalledWith("/camera");
  });

  it("doesn't offer a viewer a photo", async () => {
    const server = startTransactionServer([]);
    server.role = "viewer";
    store.dispatch(baseApi.util.resetApiState());
    await renderScreen();
    await screen.findByText("No transactions yet");
    await waitFor(() => expect(screen.getByText("They'll show up here once someone adds a document.")).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Take a photo" })).toBeNull();
  });

  it("doesn't blame a hidden period filter when nothing is waiting", async () => {
    startTransactionServer([aTransaction()]);
    await renderScreen({ ...NO_FILTERS, view: "review", period: "thisMonth" });
    expect(await screen.findByText("You're all caught up")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Filters" })).toBeTruthy();
  });

  it("forgets a failed next page once a refresh works", async () => {
    const server = startTransactionServer([...pageOf(50), aTransaction({ id: "last" })]);
    server.failListFromOffset = 50;
    await renderScreen();
    await screen.findByText("Vendor t0");
    await act(async () => {
      screen.getByTestId("transactions-list").props.onEndReached();
    });
    await screen.findByText("I couldn't load more.");
    server.failListFromOffset = null;
    await act(async () => {
      await screen.getByTestId("transactions-list").props.refreshControl.props.onRefresh();
    });
    await waitFor(() => expect(screen.queryByText("I couldn't load more.")).toBeNull());
  });

  it("says everything's done when nothing is waiting", async () => {
    startTransactionServer([aTransaction()]);
    await renderScreen({ ...NO_FILTERS, view: "review" });
    expect(await screen.findByText("You're all caught up")).toBeTruthy();
  });

  it("offers to try again when the first load fails", async () => {
    const server = startTransactionServer([aTransaction()]);
    server.offline = true;
    await renderScreen();
    expect(await screen.findByText("I couldn't load your transactions.")).toBeTruthy();
    server.offline = false;
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Home Depot")).toBeTruthy();
  });

  it("empties the search box when a link clears the vendor", async () => {
    startTransactionServer([aTransaction({ id: "t1", vendor: "Acme" }), aTransaction({ id: "t2", vendor: "Lowes" })]);
    await render(
      <Provider store={store}>
        <ToastProvider bottomOffset={0}>
          <ControlledFromOutside />
        </ToastProvider>
      </Provider>,
    );
    await screen.findByText("Acme");
    expect(screen.queryByText("Lowes")).toBeNull();
    expect(screen.getByLabelText("Search transactions by vendor").props.value).toBe("acme");
    await fireEvent.press(screen.getByRole("button", { name: "follow a link" }));
    await waitFor(() => expect(screen.getByLabelText("Search transactions by vendor").props.value).toBe(""));
    expect(await screen.findByText("Lowes")).toBeTruthy();
  });

  it("can show approved rows only, says so, and clears it", async () => {
    startTransactionServer([aTransaction({ id: "t1", vendor: "Acme", status: "approved" }), aTransaction({ id: "t2", vendor: "Lowes", status: "pending" })]);
    await renderScreen({ ...NO_FILTERS, approvedOnly: true });
    await screen.findByText("Acme");
    expect(screen.queryByText("Lowes")).toBeNull();
    expect(screen.getByText("Approved")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Clear" }));
    expect(await screen.findByText("Lowes")).toBeTruthy();
    expect(screen.queryByText("Approved")).toBeNull();
  });

  it("shows the month a link opened, asks for just that month, and lets a period replace it", async () => {
    const server = startTransactionServer([aTransaction({ status: "approved" })]);
    await renderScreen({ ...NO_FILTERS, month: "2026-03", approvedOnly: true });
    await screen.findByText("Home Depot");
    expect(screen.getByText(/March 2026/)).toBeTruthy();
    const params = server.requests.filter((request) => request.url === "/transactions").map((request) => request.params);
    expect(params).toContainEqual(expect.objectContaining({ start_date: "2026-03-01", end_date: "2026-03-31", status: "approved" }));
    await fireEvent.press(screen.getByRole("button", { name: "Filters, 2 on" }));
    expect(screen.getByRole("radio", { name: "March 2026" }).props.accessibilityState).toEqual(expect.objectContaining({ checked: true }));
    await fireEvent.press(screen.getByRole("radio", { name: "Last year" }));
    await fireEvent.press(screen.getByRole("button", { name: "Show results" }));
    await waitFor(() => expect(screen.queryByText(/March 2026/)).toBeNull());
    expect(screen.getByText(/Last year/)).toBeTruthy();
  });
});
