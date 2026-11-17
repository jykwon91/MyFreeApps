import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Provider } from "react-redux";
import NewTransactionScreen from "../src/features/transactions/NewTransactionScreen";
import TransactionEditScreen from "../src/features/transactions/TransactionEditScreen";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";
import { aProperty, aTransaction, lastPatch, startTransactionServer } from "../test-support/transactionsServer";

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), canGoBack: () => true },
  usePreventRemove: jest.fn(),
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

describe("Capital improvement — edit form", () => {
  it("shows the switch for an expense transaction", async () => {
    startTransactionServer([aTransaction()]);
    await render(
      <Provider store={store}>
        <ToastProvider bottomOffset={0}>
          <TransactionEditScreen id="t1" />
        </ToastProvider>
      </Provider>,
    );
    expect(await screen.findByLabelText("Capital improvement")).toBeTruthy();
  });

  it("hides the switch for an income transaction", async () => {
    startTransactionServer([aTransaction({ transaction_type: "income", category: "rental_revenue" })]);
    await render(
      <Provider store={store}>
        <ToastProvider bottomOffset={0}>
          <TransactionEditScreen id="t1" />
        </ToastProvider>
      </Provider>,
    );
    // Wait for form to load
    await screen.findByLabelText("Include in tax reports");
    expect(screen.queryByLabelText("Capital improvement")).toBeNull();
  });

  it("includes is_capital_improvement: true in the patch when toggled on", async () => {
    const server = startTransactionServer([aTransaction()]);
    await render(
      <Provider store={store}>
        <ToastProvider bottomOffset={0}>
          <TransactionEditScreen id="t1" />
        </ToastProvider>
      </Provider>,
    );
    await fireEvent.press(await screen.findByLabelText("Capital improvement"));
    await fireEvent.press(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(lastPatch(server)).toMatchObject({ is_capital_improvement: true }));
  });

  it("includes is_capital_improvement: false when toggled off", async () => {
    const server = startTransactionServer([aTransaction({ is_capital_improvement: true } as Parameters<typeof aTransaction>[0])]);
    await render(
      <Provider store={store}>
        <ToastProvider bottomOffset={0}>
          <TransactionEditScreen id="t1" />
        </ToastProvider>
      </Provider>,
    );
    await fireEvent.press(await screen.findByLabelText("Capital improvement"));
    await fireEvent.press(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(lastPatch(server)).toMatchObject({ is_capital_improvement: false }));
  });
});

describe("Capital improvement — new transaction form", () => {
  it("is not offered when adding by hand, same as the website", async () => {
    startTransactionServer([], [aProperty()]);
    await render(
      <Provider store={store}>
        <ToastProvider bottomOffset={0}>
          <NewTransactionScreen />
        </ToastProvider>
      </Provider>,
    );
    await screen.findByRole("button", { name: "Add transaction" });
    expect(screen.queryByLabelText("Capital improvement")).toBeNull();
  });
});
