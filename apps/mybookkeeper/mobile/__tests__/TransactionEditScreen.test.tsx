import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";
import { Provider } from "react-redux";
import TransactionEditScreen from "../src/features/transactions/TransactionEditScreen";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";
import { aProperty, aTransaction, lastPatch, startTransactionServer } from "../test-support/transactionsServer";

const mockBack = jest.fn();
const mockDispatch = jest.fn();
const mockPreventRemove = { active: false, callback: null as null | ((event: { data: { action: unknown } }) => void) };
jest.mock("expo-router", () => ({
  router: { back: () => mockBack() },
  useNavigation: () => ({ dispatch: (action: unknown) => mockDispatch(action) }),
  usePreventRemove: (active: boolean, callback: (event: { data: { action: unknown } }) => void) => {
    mockPreventRemove.active = active;
    mockPreventRemove.callback = callback;
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

async function renderScreen() {
  await render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>
        <TransactionEditScreen id="t1" />
      </ToastProvider>
    </Provider>,
  );
}

describe("TransactionEditScreen", () => {
  it("sends only what changed, and says what it learned", async () => {
    const server = startTransactionServer([aTransaction()]);
    server.retroactiveCount = 3;
    await renderScreen();
    await fireEvent.press(await screen.findByLabelText("Category, Maintenance"));
    await fireEvent.press(await screen.findByRole("radio", { name: "Utilities" }));
    expect(await screen.findByText(/I'll remember this for Home Depot/)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Saved. I'll file Home Depot under Utilities from now on. I also updated 3 other Home Depot transactions.")).toBeTruthy();
    expect(lastPatch(server)).toEqual({ category: "utilities" });
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });

  it("clears a vendor and a property", async () => {
    const server = startTransactionServer([aTransaction()]);
    await renderScreen();
    await fireEvent.changeText(await screen.findByLabelText("Vendor"), "");
    await fireEvent.press(await screen.findByLabelText("Property, Oak Street"));
    await fireEvent.press(await screen.findByRole("radio", { name: "No property" }));
    await fireEvent.press(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(lastPatch(server)).toEqual({ vendor: null, property_id: null });
  });

  it("won't save a bad amount, and sends nothing", async () => {
    const server = startTransactionServer([aTransaction()]);
    await renderScreen();
    await fireEvent.changeText(await screen.findByLabelText("Amount (USD)"), "1.234");
    await fireEvent.press(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Use dollars and cents, like 84.20.")).toBeTruthy();
    expect(server.requests.some((request) => request.method === "patch")).toBe(false);
  });

  it("picks a sensible category when the type changes", async () => {
    const server = startTransactionServer([aTransaction()]);
    await renderScreen();
    await fireEvent.press(await screen.findByRole("tab", { name: "Income" }));
    expect(await screen.findByText("I changed the category to Rental Revenue. Change it if that's wrong.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(lastPatch(server)).toEqual({ transaction_type: "income", category: "rental_revenue" });
  });

  it("restores the category when the type goes back, so nothing is learned by accident", async () => {
    const server = startTransactionServer([aTransaction({ category: "utilities" })]);
    await renderScreen();
    await fireEvent.press(await screen.findByRole("tab", { name: "Income" }));
    await fireEvent.press(screen.getByRole("tab", { name: "Expense" }));
    expect(screen.getByLabelText("Category, Utilities")).toBeTruthy();
    expect(mockPreventRemove.active).toBe(false);
    await fireEvent.press(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(server.requests.some((request) => request.method === "patch")).toBe(false);
  });

  it("saves and approves together", async () => {
    const server = startTransactionServer([aTransaction({ status: "pending" })]);
    await renderScreen();
    await fireEvent.changeText(await screen.findByLabelText("Vendor"), "Lowes");
    await fireEvent.press(screen.getByRole("button", { name: "Save and approve" }));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(lastPatch(server)).toEqual({ vendor: "Lowes", status: "approved" });
  });

  it("won't approve without a property, but will save", async () => {
    const server = startTransactionServer([aTransaction({ status: "pending", property_id: null })]);
    await renderScreen();
    expect(await screen.findByText("Choose a property to approve.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Save and approve" }));
    expect(server.requests.some((request) => request.method === "patch")).toBe(false);
    await fireEvent.changeText(screen.getByLabelText("Vendor"), "Lowes");
    await fireEvent.press(screen.getByRole("button", { name: "Save without approving" }));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(lastPatch(server)).toEqual({ vendor: "Lowes" });
  });

  it("warns that changes to an approved one count right away", async () => {
    startTransactionServer([aTransaction()]);
    await renderScreen();
    expect(await screen.findByText("This one is approved, so changes show up in your totals right away.")).toBeTruthy();
  });

  it("keeps the changes when saving fails", async () => {
    const server = startTransactionServer([aTransaction()]);
    await renderScreen();
    await fireEvent.changeText(await screen.findByLabelText("Vendor"), "Lowes");
    server.offline = true;
    await fireEvent.press(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("I can't reach the server, so I couldn't save that. Your changes are still here.")).toBeTruthy();
    expect(screen.getByDisplayValue("Lowes")).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it("doesn't show the server's validation wording", async () => {
    const server = startTransactionServer([aTransaction()]);
    await renderScreen();
    await fireEvent.changeText(await screen.findByLabelText("Vendor"), "Lowes");
    server.failWritesWith = 422;
    await fireEvent.press(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("I couldn't save that. Want to try again?")).toBeTruthy();
  });

  it("asks before throwing away unsaved changes, but not when there are none", async () => {
    startTransactionServer([aTransaction()]);
    const alert = jest.spyOn(Alert, "alert");
    await renderScreen();
    const vendor = await screen.findByLabelText("Vendor");
    expect(mockPreventRemove.active).toBe(false);
    await fireEvent.changeText(vendor, "Lowes");
    expect(mockPreventRemove.active).toBe(true);
    await act(async () => mockPreventRemove.callback?.({ data: { action: "go-back" } }));
    const buttons = alert.mock.calls[0]?.[2];
    buttons?.find((button) => button.style === "destructive")?.onPress?.();
    expect(mockDispatch).toHaveBeenCalledWith("go-back");
  });

  it("offers the row's own retired property", async () => {
    startTransactionServer([aTransaction({ property_id: "old" })], [aProperty({ id: "old", name: "Old Place", is_active: false }), aProperty()]);
    await renderScreen();
    await fireEvent.press(await screen.findByLabelText("Property, Old Place"));
    expect(await screen.findByRole("radio", { name: "Old Place" })).toBeTruthy();
  });
});
