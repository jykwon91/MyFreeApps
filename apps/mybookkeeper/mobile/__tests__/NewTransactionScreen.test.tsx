import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { AxiosAdapter } from "axios";
import { Alert } from "react-native";
import { Provider } from "react-redux";
import NewTransactionScreen from "../src/features/transactions/NewTransactionScreen";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";
import { holdWrites } from "../test-support/holdWrites";
import { aProperty, startTransactionServer } from "../test-support/transactionsServer";

const mockBack = jest.fn();
const mockDispatch = jest.fn();
const mockPreventRemove = { active: false, callback: null as null | ((event: { repeat: () => void }) => void) };
jest.mock("expo-router", () => ({
  router: { back: () => mockBack() },
  usePreventRemove: (active: boolean, callback: (event: { repeat: () => void }) => void) => {
    mockPreventRemove.active = active;
    mockPreventRemove.callback = callback;
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
  jest.restoreAllMocks();
});

async function renderScreen() {
  await render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>
        <NewTransactionScreen />
      </ToastProvider>
    </Provider>,
  );
}

const lastPost = (requests: { method?: string; url?: string; data?: unknown }[]) =>
  JSON.parse(String(requests.filter((request) => request.method === "post" && request.url === "/transactions").at(-1)?.data)) as Record<string, unknown>;

describe("NewTransactionScreen", () => {
  it("adds a transaction with the website's request, then leaves", async () => {
    const server = startTransactionServer([], [aProperty()]);
    await renderScreen();
    await fireEvent.changeText(await screen.findByLabelText("Amount (USD), required"), "84.20");
    await fireEvent.changeText(screen.getByLabelText("Vendor"), " Home Depot ");
    await fireEvent.changeText(screen.getByLabelText("Description"), "Lumber");
    await fireEvent.press(screen.getByLabelText("Category, Maintenance"));
    await fireEvent.press(await screen.findByRole("radio", { name: "Utilities" }));
    await fireEvent.press(screen.getByLabelText("Property, No property"));
    await fireEvent.press(await screen.findByRole("radio", { name: "Oak Street" }));
    await fireEvent.press(screen.getByLabelText("Channel, None"));
    await fireEvent.press(await screen.findByRole("radio", { name: "Airbnb" }));
    await fireEvent.press(screen.getByLabelText("Payment method, None"));
    await fireEvent.press(await screen.findByRole("radio", { name: "Credit Card" }));
    await fireEvent(screen.getByLabelText("Include in tax reports"), "valueChange", true);
    await fireEvent.press(screen.getByRole("button", { name: "Add transaction" }));

    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    const body = lastPost(server.requests);
    const year = new Date().getFullYear();
    expect(body).toMatchObject({
      tax_year: year,
      vendor: "Home Depot",
      description: "Lumber",
      amount: "84.20",
      transaction_type: "expense",
      category: "utilities",
      property_id: "p1",
      tax_relevant: true,
      channel: "airbnb",
      payment_method: "credit_card",
      is_manual: true,
    });
    expect(String(body.transaction_date)).toMatch(new RegExp(`^${year}-\\d\\d-\\d\\d$`));
    expect(await screen.findByText("Added.")).toBeTruthy();
  });

  it("sends empty optional fields as null", async () => {
    const server = startTransactionServer([]);
    await renderScreen();
    await fireEvent.changeText(await screen.findByLabelText("Amount (USD), required"), "10");
    await fireEvent.press(screen.getByRole("button", { name: "Add transaction" }));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(lastPost(server.requests)).toMatchObject({
      vendor: null,
      description: null,
      property_id: null,
      channel: null,
      payment_method: null,
      tax_relevant: false,
    });
  });

  it("switches to an income category when the type changes", async () => {
    const server = startTransactionServer([]);
    await renderScreen();
    await fireEvent.press(await screen.findByRole("tab", { name: "Income" }));
    expect(screen.getByLabelText("Category, Rental Revenue")).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("Amount (USD), required"), "900");
    await fireEvent.press(screen.getByRole("button", { name: "Add transaction" }));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(lastPost(server.requests)).toMatchObject({ transaction_type: "income", category: "rental_revenue" });
  });

  it("follows the date's year in the tax year", async () => {
    const server = startTransactionServer([]);
    await renderScreen();
    await fireEvent.press(await screen.findByLabelText(/^Date, /));
    await act(async () => screen.getByTestId("date-picker").props.onChange({ type: "set" }, new Date(2024, 11, 31)));
    await fireEvent.changeText(screen.getByLabelText("Amount (USD), required"), "5");
    await fireEvent.press(screen.getByRole("button", { name: "Add transaction" }));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(lastPost(server.requests)).toMatchObject({ transaction_date: "2024-12-31", tax_year: 2024 });
  });

  it.each(["", "0", "1.234", "abc"])("won't add with the amount %p, and sends nothing", async (amount) => {
    const server = startTransactionServer([]);
    await renderScreen();
    await fireEvent.changeText(await screen.findByLabelText("Amount (USD), required"), amount);
    await fireEvent.press(screen.getByRole("button", { name: "Add transaction" }));
    expect(await screen.findByText(/Enter an amount above \$0\.|Use dollars and cents/)).toBeTruthy();
    expect(server.requests.some((request) => request.method === "post")).toBe(false);
  });

  it("keeps what was typed and says so when it can't reach the server", async () => {
    const server = startTransactionServer([]);
    await renderScreen();
    await fireEvent.changeText(await screen.findByLabelText("Amount (USD), required"), "12");
    server.offline = true;
    await fireEvent.press(screen.getByRole("button", { name: "Add transaction" }));
    expect(await screen.findByText("I can't reach the server, so I couldn't add that. Your details are still here.")).toBeTruthy();
    expect(screen.getByDisplayValue("12")).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it("doesn't show the server's wording on a rejected request", async () => {
    const server = startTransactionServer([]);
    await renderScreen();
    await fireEvent.changeText(await screen.findByLabelText("Amount (USD), required"), "12");
    server.failWritesWith = 422;
    await fireEvent.press(screen.getByRole("button", { name: "Add transaction" }));
    expect(await screen.findByText("I couldn't add that. Want to try again?")).toBeTruthy();
  });

  it("tells a read-only member they can't add", async () => {
    const server = startTransactionServer([]);
    await renderScreen();
    await fireEvent.changeText(await screen.findByLabelText("Amount (USD), required"), "12");
    server.failWritesWith = 403;
    await fireEvent.press(screen.getByRole("button", { name: "Add transaction" }));
    expect(await screen.findByText("You have read-only access, so I can't add transactions.")).toBeTruthy();
  });

  it("shows loading on the button while it's on its way, and ignores a second tap", async () => {
    startTransactionServer([]);
    await renderScreen();
    await fireEvent.changeText(await screen.findByLabelText("Amount (USD), required"), "12");
    holdWrites();
    const held = api.defaults.adapter as AxiosAdapter;
    const writes: string[] = [];
    api.defaults.adapter = (config) => {
      if (config.method === "post") writes.push(String(config.url));
      return held(config);
    };
    await fireEvent.press(screen.getByRole("button", { name: "Add transaction" }));
    expect(await screen.findByText("Adding…")).toBeTruthy();
    await fireEvent.press(screen.getByText("Adding…"));
    expect(writes).toEqual(["/transactions"]);
  });

  it("asks before throwing away what was typed, but not when nothing was", async () => {
    startTransactionServer([]);
    const alert = jest.spyOn(Alert, "alert");
    await renderScreen();
    const amount = await screen.findByLabelText("Amount (USD), required");
    expect(mockPreventRemove.active).toBe(false);
    await fireEvent.changeText(amount, "12");
    expect(mockPreventRemove.active).toBe(true);
    await act(async () => mockPreventRemove.callback?.({ repeat: () => mockDispatch("go-back") }));
    alert.mock.calls[0]?.[2]?.find((button) => button.style === "destructive")?.onPress?.();
    expect(mockDispatch).toHaveBeenCalledWith("go-back");
  });
});
