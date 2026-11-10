import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { AxiosAdapter } from "axios";
import { useState } from "react";
import { Alert } from "react-native";
import { Provider } from "react-redux";
import { NO_FILTERS } from "../src/constants/transactionFilters";
import TransactionsScreen from "../src/features/transactions/TransactionsScreen";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";
import type { TransactionFilters } from "../src/types/TransactionFilters";
import { holdWrites } from "../test-support/holdWrites";
import { pressAlertButton } from "../test-support/pressAlertButton";
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
let alert: jest.SpiedFunction<typeof Alert.alert>;

beforeEach(() => {
  session.tokenStore.set("token");
  store.dispatch(baseApi.util.resetApiState());
  store.dispatch(workspaceChosen("w1"));
  jest.clearAllMocks();
  alert = jest.spyOn(Alert, "alert");
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
  alert.mockRestore();
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

const rows = [
  aTransaction({ id: "a", vendor: "Acme" }),
  aTransaction({ id: "b", vendor: "Bolt" }),
  aTransaction({ id: "c", vendor: "Cog" }),
  aTransaction({ id: "d", vendor: "Done" }),
  aTransaction({ id: "e", vendor: "Echo" }),
];

const deleteRequests = (requests: { url?: string; data?: unknown }[]) =>
  requests.filter((request) => request.url === "/transactions/bulk-delete").map((request) => (JSON.parse(String(request.data)) as { ids: string[] }).ids);

async function selectAll() {
  await screen.findByText("Acme");
  await fireEvent.press(screen.getByRole("button", { name: "Select several transactions" }));
  await fireEvent.press(screen.getByRole("button", { name: "Select all the transactions shown" }));
}

describe("deleting several transactions", () => {
  it("asks first, naming how many, and does nothing if you back out", async () => {
    const server = startTransactionServer(rows);
    await renderScreen();
    await fireEvent(await screen.findByLabelText(/Acme/), "longPress");
    await fireEvent.press(screen.getByRole("checkbox", { name: /Bolt/ }));
    await fireEvent.press(screen.getByRole("button", { name: "Delete 2 selected" }));
    expect(alert.mock.calls[0]?.[0]).toBe("Delete 2 transactions?");
    expect(alert.mock.calls[0]?.[1]).toContain("can't be undone");
    await pressAlertButton(alert, "Cancel");
    expect(deleteRequests(server.requests)).toEqual([]);
    expect(screen.getByText("2 selected")).toBeTruthy();
  });

  it("deletes in batches the server accepts, says so, and clears the selection and the rows", async () => {
    const server = startTransactionServer(rows);
    await renderScreen();
    await selectAll();
    await fireEvent.press(screen.getByRole("button", { name: "Delete 5 selected" }));
    await pressAlertButton(alert, "Delete");
    expect(await screen.findByText("5 transaction(s) deleted")).toBeTruthy();
    expect(deleteRequests(server.requests)).toEqual([["a", "b"], ["c", "d"], ["e"]]);
    expect(server.transactions).toEqual([]);
    await waitFor(() => expect(screen.queryByText(/selected$/)).toBeNull());
    expect(screen.queryByText("Acme")).toBeNull();
  });

  it("says what the earlier batches did when a later one fails, and keeps only the rest selected", async () => {
    const server = startTransactionServer(rows);
    server.bulkDeletesBeforeFailing = 1;
    await renderScreen();
    await selectAll();
    await fireEvent.press(screen.getByRole("button", { name: "Delete 5 selected" }));
    await pressAlertButton(alert, "Delete");
    expect(await screen.findByText("Deleted 2. The rest failed — try again.")).toBeTruthy();
    expect(await screen.findByText("3 selected")).toBeTruthy();
    expect(server.transactions.map((row) => row.id)).toEqual(["c", "d", "e"]);
    await waitFor(() => expect(screen.queryByText("Acme")).toBeNull());
    expect(screen.getByRole("checkbox", { name: /Cog/ }).props.accessibilityState).toMatchObject({ checked: true });
  });

  it("reports a plain failure, and keeps the whole selection, when nothing went through", async () => {
    const server = startTransactionServer(rows);
    await renderScreen();
    await fireEvent(await screen.findByLabelText(/Acme/), "longPress");
    server.failWritesWith = 500;
    await fireEvent.press(screen.getByRole("button", { name: "Delete 1 selected" }));
    await pressAlertButton(alert, "Delete");
    expect(await screen.findByText("I couldn't delete those. Want to try again?")).toBeTruthy();
    expect(screen.getByText("1 selected")).toBeTruthy();
    expect(server.transactions).toHaveLength(5);
  });

  it("says when it can't reach the server", async () => {
    const server = startTransactionServer(rows);
    await renderScreen();
    await fireEvent(await screen.findByLabelText(/Acme/), "longPress");
    server.offline = true;
    await fireEvent.press(screen.getByRole("button", { name: "Delete 1 selected" }));
    await pressAlertButton(alert, "Delete");
    expect(await screen.findByText("I can't reach the server, so I couldn't delete those. They're still selected.")).toBeTruthy();
    expect(screen.getByText("1 selected")).toBeTruthy();
  });

  it("says so on a 403, and keeps the selection", async () => {
    const server = startTransactionServer(rows);
    await renderScreen();
    await fireEvent(await screen.findByLabelText(/Acme/), "longPress");
    server.failWritesWith = 403;
    await fireEvent.press(screen.getByRole("button", { name: "Delete 1 selected" }));
    await pressAlertButton(alert, "Delete");
    expect(await screen.findByText("You have read-only access, so I can't delete these.")).toBeTruthy();
    expect(screen.getByText("1 selected")).toBeTruthy();
  });

  it("asks once however many times Delete is tapped before answering", async () => {
    startTransactionServer(rows);
    await renderScreen();
    await fireEvent(await screen.findByLabelText(/Acme/), "longPress");
    await fireEvent.press(screen.getByRole("button", { name: "Delete 1 selected" }));
    await fireEvent.press(screen.getByRole("button", { name: "Delete 1 selected" }));
    expect(alert).toHaveBeenCalledTimes(1);
  });

  it("shows loading at once and sends one request however many times it is tapped", async () => {
    startTransactionServer(rows);
    await renderScreen();
    await fireEvent(await screen.findByLabelText(/Acme/), "longPress");
    holdWrites();
    const held = api.defaults.adapter as AxiosAdapter;
    const writes: string[] = [];
    api.defaults.adapter = (config) => {
      if (config.method === "post") writes.push(String(config.url));
      return held(config);
    };
    await fireEvent.press(screen.getByRole("button", { name: "Delete 1 selected" }));
    await pressAlertButton(alert, "Delete");
    expect(await screen.findByText("Deleting…")).toBeTruthy();
    await fireEvent.press(screen.getByText("Deleting…"));
    await fireEvent.press(screen.getByText("Deleting…"));
    expect(alert).toHaveBeenCalledTimes(1);
    expect(writes).toEqual(["/transactions/bulk-delete"]);
    expect(screen.getByRole("button", { name: "Stop selecting" }).props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByRole("button", { name: "Approve 0 selected" }).props.accessibilityState).toMatchObject({ disabled: true });
  });

  it("deletes anything selected, including rows that can't be approved", async () => {
    const server = startTransactionServer([aTransaction({ id: "x", vendor: "Done", status: "approved", property_id: null })]);
    await renderScreen();
    await fireEvent(await screen.findByLabelText(/Done/), "longPress");
    await fireEvent.press(screen.getByRole("button", { name: "Delete 1 selected" }));
    await pressAlertButton(alert, "Delete");
    expect(await screen.findByText("1 transaction(s) deleted")).toBeTruthy();
    expect(deleteRequests(server.requests)).toEqual([["x"]]);
  });

  it("can't delete with nothing selected", async () => {
    const server = startTransactionServer(rows);
    await renderScreen();
    await screen.findByText("Acme");
    await fireEvent.press(screen.getByRole("button", { name: "Select several transactions" }));
    await fireEvent.press(screen.getByRole("button", { name: "Delete 0 selected" }));
    expect(alert).not.toHaveBeenCalled();
    expect(deleteRequests(server.requests)).toEqual([]);
  });

  it("offers a viewer no way to select, so no way to delete", async () => {
    const server = startTransactionServer(rows);
    server.role = "viewer";
    await renderScreen();
    await screen.findByText("Acme");
    await fireEvent(screen.getByLabelText(/Acme/), "longPress");
    expect(screen.queryByRole("button", { name: /^Delete \d+ selected$/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Select several transactions" })).toBeNull();
  });
});
