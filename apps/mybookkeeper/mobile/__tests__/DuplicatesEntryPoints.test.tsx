import api from "@platform/core/lib/api";
import { ToastProvider } from "@platform/mobile";
import { baseApi } from "@platform/core/store/baseApi";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { Provider } from "react-redux";
import { NO_FILTERS } from "../src/constants/transactionFilters";
import TransactionsScreen from "../src/features/transactions/TransactionsScreen";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";
import { renderHome } from "../test-support/homeScreen";
import { aDuplicatePair } from "../test-support/aDuplicatePair";
import { aTransaction, startTransactionServer } from "../test-support/transactionsServer";

const mockPush = jest.fn();
const mockNavigate = jest.fn();
jest.mock("expo-router", () => ({
  router: { push: (path: string) => mockPush(path), navigate: (path: string) => mockNavigate(path) },
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

async function renderMoney() {
  await render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>
        <TransactionsScreen filters={NO_FILTERS} onFiltersChange={() => undefined} onVendorChange={() => undefined} />
      </ToastProvider>
    </Provider>,
  );
}

describe("getting to the duplicates", () => {
  it("shows a row on the Money tab with the count, opening the list", async () => {
    const server = startTransactionServer([aTransaction()]);
    server.duplicates = [aDuplicatePair(), aDuplicatePair({ id: "x_y" })];
    await renderMoney();
    await fireEvent.press(await screen.findByRole("button", { name: "2 possible duplicates" }));
    expect(mockPush).toHaveBeenCalledWith("/duplicates");
  });

  it("shows nothing on the Money tab when there are none", async () => {
    startTransactionServer([aTransaction()]);
    await renderMoney();
    await screen.findByText("Home Depot");
    expect(screen.queryByText(/possible duplicate/)).toBeNull();
  });

  it("shows nothing on the Money tab when they can't be loaded", async () => {
    const server = startTransactionServer([aTransaction()]);
    server.duplicates = [aDuplicatePair()];
    const answer = api.defaults.adapter as (config: { url?: string }) => Promise<unknown>;
    api.defaults.adapter = ((config: { url?: string }) =>
      config.url === "/transactions/duplicates" ? Promise.reject(Object.assign(new Error("Network Error"), { config })) : answer(config)) as typeof api.defaults.adapter;
    await renderMoney();
    await screen.findByText("Home Depot");
    expect(screen.queryByText(/possible duplicate/)).toBeNull();
  });

  it("puts them in Home's waiting card, which isn't caught up while they wait", async () => {
    const server = startTransactionServer([]);
    server.duplicates = [aDuplicatePair()];
    await renderHome();
    await fireEvent.press(await screen.findByRole("button", { name: "1 possible duplicate" }));
    expect(mockNavigate).toHaveBeenCalledWith("/duplicates");
    expect(screen.queryByText("You're all caught up.")).toBeNull();
  });

  it("leaves Home caught up when there are none", async () => {
    startTransactionServer([]);
    await renderHome();
    expect(await screen.findByText("You're all caught up.")).toBeTruthy();
  });
});
