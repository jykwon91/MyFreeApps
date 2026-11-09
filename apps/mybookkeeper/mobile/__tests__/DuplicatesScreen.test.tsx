import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Provider } from "react-redux";
import { SHOWING_LAST_LOADED_MESSAGE } from "../src/constants/offline";
import DuplicatesScreen from "../src/features/duplicates/DuplicatesScreen";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";
import { aDuplicatePair, aDuplicateSide } from "../test-support/aDuplicatePair";
import { startTransactionServer } from "../test-support/transactionsServer";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ router: { push: (path: string) => mockPush(path) } }));

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

async function renderScreen() {
  await render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>
        <DuplicatesScreen />
      </ToastProvider>
    </Provider>,
  );
}

describe("DuplicatesScreen", () => {
  it("lists each suspected pair with what makes it suspect, and opens one to compare", async () => {
    const server = startTransactionServer([]);
    server.duplicates = [
      aDuplicatePair(),
      aDuplicatePair({
        transaction_a: aDuplicateSide({ id: "c1", vendor: "Lowes", amount: "10.00", transaction_date: "2026-04-01" }),
        transaction_b: aDuplicateSide({ id: "d1", vendor: "Lowes", amount: "10.00", transaction_date: "2026-04-01" }),
        date_diff_days: 0,
        confidence: "low",
        property_match: false,
      }),
    ];
    await renderScreen();
    expect(await screen.findByText("2 possible duplicates")).toBeTruthy();
    expect(screen.getByText("Same amount, 2 days apart · Mar 14 and Mar 16")).toBeTruthy();
    expect(screen.getByText("High confidence")).toBeTruthy();
    expect(screen.getByText("Low confidence")).toBeTruthy();
    expect(screen.getByText("Different properties")).toBeTruthy();
    expect(screen.getByText("Same amount, same date · Apr 1")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: /Home Depot, \$84.20, Same amount, 2 days apart, High confidence/ }));
    expect(mockPush).toHaveBeenCalledWith("/duplicates/a1_b1");
  });

  it("shows a skeleton that mirrors the list while it loads", async () => {
    startTransactionServer([]);
    api.defaults.adapter = () => new Promise(() => undefined);
    await renderScreen();
    expect(screen.getByTestId("duplicates-skeleton")).toBeTruthy();
    expect(screen.getByLabelText("Loading your possible duplicates")).toBeTruthy();
  });

  it("says when there is nothing to review", async () => {
    startTransactionServer([]);
    await renderScreen();
    expect(await screen.findByText("No suspected duplicates right now")).toBeTruthy();
    expect(screen.getByText(/same amount, property, and similar dates/)).toBeTruthy();
  });

  it("offers a retry when the list can't load, and loads on retry", async () => {
    const server = startTransactionServer([]);
    server.offline = true;
    await renderScreen();
    expect(await screen.findByText("I couldn't load your possible duplicates.")).toBeTruthy();
    server.offline = false;
    server.duplicates = [aDuplicatePair()];
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("1 possible duplicate")).toBeTruthy();
  });

  it("keeps the last list and says so when a refresh fails", async () => {
    const server = startTransactionServer([]);
    server.duplicates = [aDuplicatePair()];
    await renderScreen();
    await screen.findByText("1 possible duplicate");
    server.offline = true;
    await act(async () => {
      await screen.getByTestId("duplicates-list").props.refreshControl.props.onRefresh();
    });
    expect(await screen.findByText(SHOWING_LAST_LOADED_MESSAGE)).toBeTruthy();
    expect(screen.getByText("1 possible duplicate")).toBeTruthy();
  });

  it("tells a viewer they can look but not change", async () => {
    const server = startTransactionServer([]);
    server.role = "viewer";
    server.duplicates = [aDuplicatePair()];
    await renderScreen();
    expect(await screen.findByText(/view-only access/)).toBeTruthy();
  });
});
