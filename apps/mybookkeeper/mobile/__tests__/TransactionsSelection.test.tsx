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
import { holdWrites } from "../test-support/holdWrites";
import { aTransaction, startTransactionServer } from "../test-support/transactionsServer";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  router: { push: (path: string) => mockPush(path) },
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

const waiting = [
  aTransaction({ id: "a", vendor: "Acme", status: "pending" }),
  aTransaction({ id: "b", vendor: "Bolt", status: "needs_review" }),
  aTransaction({ id: "c", vendor: "Cog", status: "pending", property_id: null }),
  aTransaction({ id: "d", vendor: "Done", status: "approved" }),
];

const bulkRequests = (requests: { method?: string; url?: string; data?: unknown }[]) =>
  requests.filter((request) => request.url === "/transactions/bulk-approve");

describe("picking several transactions", () => {
  it("starts from a long press, ticks that one, and shows the count", async () => {
    startTransactionServer(waiting);
    await renderScreen();
    await fireEvent(await screen.findByLabelText(/Acme/), "longPress");
    expect(screen.getByText("1 selected")).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: /Acme/ }).props.accessibilityState).toMatchObject({ checked: true });
    expect(screen.getByRole("checkbox", { name: /Bolt/ }).props.accessibilityState).toMatchObject({ checked: false });
  });

  it("starts from the Select button too, and taps tick rows instead of opening them", async () => {
    startTransactionServer(waiting);
    await renderScreen();
    await screen.findByText("Acme");
    await fireEvent.press(screen.getByRole("button", { name: "Select several transactions" }));
    expect(screen.queryByText(/selected/)).toBeTruthy();
    expect(screen.getByText("0 selected")).toBeTruthy();
    await fireEvent.press(screen.getByRole("checkbox", { name: /Acme/ }));
    await fireEvent.press(screen.getByRole("checkbox", { name: /Bolt/ }));
    expect(screen.getByText("2 selected")).toBeTruthy();
    await fireEvent.press(screen.getByRole("checkbox", { name: /Bolt/ }));
    expect(screen.getByText("1 selected")).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("approves the selected ones with the website's request and says how many went through", async () => {
    const server = startTransactionServer(waiting);
    await renderScreen();
    await fireEvent(await screen.findByLabelText(/Acme/), "longPress");
    await fireEvent.press(screen.getByRole("checkbox", { name: /Bolt/ }));
    await fireEvent.press(screen.getByRole("button", { name: "Approve 2 selected" }));
    expect(await screen.findByText("2 approved")).toBeTruthy();
    expect(JSON.parse(String(bulkRequests(server.requests)[0]?.data))).toEqual({ ids: ["a", "b"] });
    await waitFor(() => expect(screen.queryByText(/selected$/)).toBeNull());
  });

  it("sends only what can be approved, and says what can't", async () => {
    const server = startTransactionServer(waiting);
    await renderScreen();
    await screen.findByText("Acme");
    await fireEvent.press(screen.getByRole("button", { name: "Select several transactions" }));
    await fireEvent.press(screen.getByRole("button", { name: "Select all the transactions shown" }));
    expect(screen.getByText("4 selected")).toBeTruthy();
    expect(screen.getByText(/2 of these can't be approved here/)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Approve 2 selected" }));
    await screen.findByText("2 approved");
    expect(JSON.parse(String(bulkRequests(server.requests)[0]?.data))).toEqual({ ids: ["a", "b"] });
  });

  it("can't approve when none of the selected can be", async () => {
    const server = startTransactionServer(waiting);
    await renderScreen();
    await fireEvent(await screen.findByLabelText(/Done/), "longPress");
    await fireEvent.press(screen.getByRole("button", { name: "Approve 0 selected" }));
    expect(bulkRequests(server.requests)).toHaveLength(0);
  });

  it("shows loading on Approve while it's on its way, and disables Cancel", async () => {
    startTransactionServer(waiting);
    await renderScreen();
    await fireEvent(await screen.findByLabelText(/Acme/), "longPress");
    holdWrites();
    const held = api.defaults.adapter as AxiosAdapter;
    const writes: string[] = [];
    api.defaults.adapter = (config) => {
      if (config.method === "post") writes.push(String(config.url));
      return held(config);
    };
    await fireEvent.press(screen.getByRole("button", { name: "Approve 1 selected" }));
    expect(await screen.findByText("Approving…")).toBeTruthy();
    await fireEvent.press(screen.getByText("Approving…"));
    expect(writes).toEqual(["/transactions/bulk-approve"]);
    expect(screen.getByRole("button", { name: "Stop selecting" }).props.accessibilityState).toMatchObject({ disabled: true });
  });

  it("keeps the selection when approving fails", async () => {
    const server = startTransactionServer(waiting);
    await renderScreen();
    await fireEvent(await screen.findByLabelText(/Acme/), "longPress");
    server.failWritesWith = 500;
    await fireEvent.press(screen.getByRole("button", { name: "Approve 1 selected" }));
    expect(await screen.findByText("I couldn't approve those. Want to try again?")).toBeTruthy();
    expect(screen.getByText("1 selected")).toBeTruthy();
  });

  it("says when it can't reach the server", async () => {
    const server = startTransactionServer(waiting);
    await renderScreen();
    await fireEvent(await screen.findByLabelText(/Acme/), "longPress");
    server.offline = true;
    await fireEvent.press(screen.getByRole("button", { name: "Approve 1 selected" }));
    expect(await screen.findByText("I can't reach the server, so I couldn't approve those. They're still selected.")).toBeTruthy();
  });

  it("stops picking on Cancel", async () => {
    startTransactionServer(waiting);
    await renderScreen();
    await fireEvent(await screen.findByLabelText(/Acme/), "longPress");
    await fireEvent.press(screen.getByRole("button", { name: "Stop selecting" }));
    expect(screen.queryByText("1 selected")).toBeNull();
    await fireEvent.press(screen.getByLabelText(/Acme/));
    expect(mockPush).toHaveBeenCalledWith("/transactions/a");
  });

  it("doesn't offer a viewer any of it", async () => {
    const server = startTransactionServer(waiting);
    server.role = "viewer";
    await renderScreen();
    await screen.findByText("Acme");
    await fireEvent(screen.getByLabelText(/Acme/), "longPress");
    expect(screen.queryByText("1 selected")).toBeNull();
    expect(screen.queryByRole("button", { name: "Select several transactions" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add a transaction by hand" })).toBeNull();
  });
});

describe("adding by hand", () => {
  it("opens the new transaction screen from the Money tab", async () => {
    startTransactionServer(waiting);
    await renderScreen();
    await screen.findByText("Acme");
    await fireEvent.press(screen.getByRole("button", { name: "Add a transaction by hand" }));
    expect(mockPush).toHaveBeenCalledWith("/transactions/new");
  });
});
