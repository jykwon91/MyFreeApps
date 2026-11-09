import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { useState } from "react";
import { Provider } from "react-redux";
import { NO_FILTERS } from "../src/constants/transactionFilters";
import TransactionsScreen from "../src/features/transactions/TransactionsScreen";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";
import type { TransactionFilters } from "../src/types/TransactionFilters";
import { aTransaction, startTransactionServer } from "../test-support/transactionsServer";

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
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
});

function Harness({ initial }: { initial: TransactionFilters }) {
  const [filters, setFilters] = useState(initial);
  return <TransactionsScreen filters={filters} onFiltersChange={setFilters} onVendorChange={() => undefined} />;
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

const rows = [
  aTransaction({ id: "jan", vendor: "January", transaction_date: "2026-01-15" }),
  aTransaction({ id: "feb", vendor: "February", transaction_date: "2026-02-15" }),
  aTransaction({ id: "mar", vendor: "March", transaction_date: "2026-03-15" }),
];

const pick = (testID: string, date: Date) => act(async () => screen.getByTestId(testID).props.onChange({ type: "set" }, date));

describe("the custom range in the filter sheet", () => {
  it("shows only the days chosen, says so, and sends them to the server", async () => {
    const server = startTransactionServer(rows);
    await renderScreen();
    await screen.findByText("January");
    await fireEvent.press(screen.getByRole("button", { name: "Filters" }));
    await fireEvent.press(screen.getByRole("radio", { name: "Custom range" }));
    await fireEvent.press(screen.getByLabelText(/^From, /));
    await pick("date-picker", new Date(2026, 1, 1));
    await fireEvent.press(screen.getByLabelText(/^To, /));
    await pick("date-picker", new Date(2026, 1, 28));
    await fireEvent.press(screen.getByRole("button", { name: "Show results" }));
    await waitFor(() => expect(screen.queryByText("January")).toBeNull());
    expect(screen.getByText("February")).toBeTruthy();
    expect(screen.queryByText("March")).toBeNull();
    expect(screen.getByRole("button", { name: "Filters, 1 on" })).toBeTruthy();
    expect(screen.getByText(/Feb 1, 2026 to Feb 28, 2026/)).toBeTruthy();
    expect(server.requests.some((request) => (request.params as { start_date?: string; end_date?: string } | undefined)?.start_date === "2026-02-01")).toBe(true);
  });

  it("moves the end along when the start is picked after it", async () => {
    startTransactionServer(rows);
    await renderScreen({ ...NO_FILTERS, period: "custom", startDate: "2026-02-01", endDate: "2026-02-28" });
    await screen.findByText("February");
    await fireEvent.press(screen.getByRole("button", { name: "Filters, 1 on" }));
    await fireEvent.press(screen.getByLabelText(/^From, /));
    await pick("date-picker", new Date(2026, 2, 20));
    expect(screen.getByLabelText(/^To, .*Mar 20, 2026$/)).toBeTruthy();
  });

  it("keeps the range chosen when another period is tried and then Custom is picked again", async () => {
    startTransactionServer(rows);
    await renderScreen({ ...NO_FILTERS, period: "custom", startDate: "2026-02-01", endDate: "2026-02-28" });
    await screen.findByText("February");
    await fireEvent.press(screen.getByRole("button", { name: "Filters, 1 on" }));
    expect(screen.getByRole("radio", { name: "Custom range" }).props.accessibilityState).toMatchObject({ checked: true });
    await fireEvent.press(screen.getByRole("radio", { name: "All time" }));
    expect(screen.queryByLabelText(/^From, /)).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Show results" }));
    expect(await screen.findByText("January")).toBeTruthy();
  });

  it("clears the range with Clear all", async () => {
    startTransactionServer(rows);
    await renderScreen({ ...NO_FILTERS, period: "custom", startDate: "2026-02-01", endDate: "2026-02-28" });
    await screen.findByText("February");
    await fireEvent.press(screen.getByRole("button", { name: "Filters, 1 on" }));
    await fireEvent.press(screen.getByRole("button", { name: "Clear all" }));
    await fireEvent.press(screen.getByRole("button", { name: "Show results" }));
    expect(await screen.findByText("March")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Filters" })).toBeTruthy();
  });
});
