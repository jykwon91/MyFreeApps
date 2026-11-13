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
import { aProperty, aSavedVendor, aTransaction, lastPatch, startTransactionServer } from "../test-support/transactionsServer";
import { holdWrites } from "../test-support/holdWrites";

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
    await act(async () => mockPreventRemove.callback?.({ repeat: () => mockDispatch("go-back") }));
    const buttons = alert.mock.calls[0]?.[2];
    buttons?.find((button) => button.style === "destructive")?.onPress?.();
    expect(mockDispatch).toHaveBeenCalledWith("go-back");
  });

  it("ignores going back while a save is on its way, so Discard can't beat it", async () => {
    startTransactionServer([aTransaction()]);
    const alert = jest.spyOn(Alert, "alert");
    alert.mockClear();
    await renderScreen();
    await fireEvent.changeText(await screen.findByLabelText("Vendor"), "Lowes");
    holdWrites();
    await fireEvent.press(screen.getByRole("button", { name: "Save" }));
    await act(async () => mockPreventRemove.callback?.({ repeat: () => mockDispatch("go-back") }));
    expect(alert).not.toHaveBeenCalled();
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("offers the row's own retired property", async () => {
    startTransactionServer([aTransaction({ property_id: "old" })], [aProperty({ id: "old", name: "Old Place", is_active: false }), aProperty()]);
    await renderScreen();
    await fireEvent.press(await screen.findByLabelText("Property, Old Place"));
    expect(await screen.findByRole("radio", { name: "Old Place" })).toBeTruthy();
  });

  describe("tax year, saved vendor, channel, payment method and tax relevance", () => {
    const filled = { vendor_id: "v1", channel: "airbnb", payment_method: "check", tax_relevant: true, tax_year: 2026 };

    async function save() {
      await fireEvent.press(screen.getByRole("button", { name: "Save" }));
      await waitFor(() => expect(mockBack).toHaveBeenCalled());
    }

    it("shows them filled in from the transaction", async () => {
      const server = startTransactionServer([aTransaction(filled)]);
      server.vendors = [aSavedVendor()];
      await renderScreen();
      expect(await screen.findByLabelText("Saved vendor, Ace Plumbing")).toBeTruthy();
      expect(screen.getByLabelText("Tax year").props.value).toBe("2026");
      expect(screen.getByLabelText("Channel, Airbnb")).toBeTruthy();
      expect(screen.getByLabelText("Payment method, Check")).toBeTruthy();
      expect(screen.getByLabelText("Include in tax reports").props.value).toBe(true);
    });

    it("sends a new tax year, without asking about the date", async () => {
      const server = startTransactionServer([aTransaction()]);
      const alert = jest.spyOn(Alert, "alert");
      alert.mockClear();
      await renderScreen();
      await fireEvent.changeText(await screen.findByLabelText("Tax year"), "2025");
      await save();
      expect(lastPatch(server)).toEqual({ tax_year: 2025 });
      expect(alert).not.toHaveBeenCalled();
    });

    it("won't save a tax year outside the allowed years", async () => {
      const server = startTransactionServer([aTransaction()]);
      await renderScreen();
      await fireEvent.changeText(await screen.findByLabelText("Tax year"), "2019");
      await fireEvent.press(screen.getByRole("button", { name: "Save" }));
      expect(await screen.findByText("Use a year from 2020 to 2099.")).toBeTruthy();
      expect(server.requests.some((request) => request.method === "patch")).toBe(false);
    });

    it("links a saved vendor", async () => {
      const server = startTransactionServer([aTransaction()]);
      server.vendors = [aSavedVendor(), aSavedVendor({ id: "v2", name: "Bright Electric" })];
      await renderScreen();
      await fireEvent.press(await screen.findByLabelText("Saved vendor, None"));
      await fireEvent.press(await screen.findByRole("radio", { name: "Bright Electric" }));
      await save();
      expect(lastPatch(server)).toEqual({ vendor_id: "v2" });
    });

    it("takes a saved vendor off", async () => {
      const server = startTransactionServer([aTransaction({ vendor_id: "v1" })]);
      server.vendors = [aSavedVendor()];
      await renderScreen();
      await fireEvent.press(await screen.findByLabelText("Saved vendor, Ace Plumbing"));
      await fireEvent.press(await screen.findByRole("radio", { name: "None" }));
      await save();
      expect(lastPatch(server)).toEqual({ vendor_id: null });
    });

    it("sends a new channel and payment method", async () => {
      const server = startTransactionServer([aTransaction()]);
      await renderScreen();
      await fireEvent.press(await screen.findByLabelText("Channel, None"));
      await fireEvent.press(await screen.findByRole("radio", { name: "Vrbo" }));
      await fireEvent.press(screen.getByLabelText("Payment method, None"));
      await fireEvent.press(await screen.findByRole("radio", { name: "Bank Transfer" }));
      await save();
      expect(lastPatch(server)).toEqual({ channel: "vrbo", payment_method: "bank_transfer" });
    });

    it("clears a channel and payment method as null, the way the website does", async () => {
      const server = startTransactionServer([aTransaction(filled)]);
      await renderScreen();
      await fireEvent.press(await screen.findByLabelText("Channel, Airbnb"));
      await fireEvent.press(await screen.findByRole("radio", { name: "None" }));
      await fireEvent.press(screen.getByLabelText("Payment method, Check"));
      await fireEvent.press(await screen.findByRole("radio", { name: "None" }));
      await save();
      expect(lastPatch(server)).toEqual({ channel: null, payment_method: null });
    });

    it("turns tax reports on and off", async () => {
      const server = startTransactionServer([aTransaction()]);
      await renderScreen();
      await fireEvent(await screen.findByLabelText("Include in tax reports"), "valueChange", true);
      expect(mockPreventRemove.active).toBe(true);
      await save();
      expect(lastPatch(server)).toEqual({ tax_relevant: true });
    });

    it("turns tax reports off for one that was in them", async () => {
      const server = startTransactionServer([aTransaction({ tax_relevant: true })]);
      await renderScreen();
      await fireEvent(await screen.findByLabelText("Include in tax reports"), "valueChange", false);
      await save();
      expect(lastPatch(server)).toEqual({ tax_relevant: false });
    });
  });

  describe("changing the date", () => {
    async function pickDate(date: Date) {
      await fireEvent.press(await screen.findByLabelText(/^Date, /));
      await act(async () => screen.getByTestId("date-picker").props.onChange({ type: "set" }, date));
    }

    function answerTaxYearPrompt(buttonText: string) {
      return jest.spyOn(Alert, "alert").mockImplementation((_title, _message, buttons) => {
        buttons?.find((button) => button.text === buttonText)?.onPress?.();
      });
    }

    it("sends just the date, with no question, when the year stays the same", async () => {
      const server = startTransactionServer([aTransaction()]);
      const alert = jest.spyOn(Alert, "alert");
      alert.mockClear();
      await renderScreen();
      await pickDate(new Date(2026, 5, 2));
      await fireEvent.press(screen.getByRole("button", { name: "Save" }));
      await waitFor(() => expect(mockBack).toHaveBeenCalled());
      expect(lastPatch(server)).toEqual({ transaction_date: "2026-06-02" });
      expect(alert).not.toHaveBeenCalled();
    });

    it("asks which tax year it belongs to when the date moves to another year, and moves it on request", async () => {
      const server = startTransactionServer([aTransaction()]);
      const alert = answerTaxYearPrompt("Move to 2025");
      await renderScreen();
      await pickDate(new Date(2025, 11, 31));
      await fireEvent.press(screen.getByRole("button", { name: "Save" }));
      await waitFor(() => expect(mockBack).toHaveBeenCalled());
      expect(alert.mock.calls[0]?.[0]).toBe("Move it to tax year 2025?");
      expect(alert.mock.calls[0]?.[1]).toContain("filed under tax year 2026");
      expect(lastPatch(server)).toEqual({ transaction_date: "2025-12-31", tax_year: 2025 });
    });

    it("can keep the old tax year", async () => {
      const server = startTransactionServer([aTransaction()]);
      answerTaxYearPrompt("Keep 2026");
      await renderScreen();
      await pickDate(new Date(2025, 11, 31));
      await fireEvent.press(screen.getByRole("button", { name: "Save" }));
      await waitFor(() => expect(mockBack).toHaveBeenCalled());
      expect(lastPatch(server)).toEqual({ transaction_date: "2025-12-31" });
    });

    it("saves nothing when the question is backed out of", async () => {
      const server = startTransactionServer([aTransaction()]);
      answerTaxYearPrompt("Keep editing");
      await renderScreen();
      await pickDate(new Date(2025, 11, 31));
      await fireEvent.press(screen.getByRole("button", { name: "Save" }));
      await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toBeTruthy());
      expect(server.requests.some((request) => request.method === "patch")).toBe(false);
      expect(mockBack).not.toHaveBeenCalled();
    });

    it("asks again for a row whose tax year already differs from its date", async () => {
      const server = startTransactionServer([aTransaction({ transaction_date: "2026-01-02", tax_year: 2025 })]);
      answerTaxYearPrompt("Move to 2026");
      await renderScreen();
      await pickDate(new Date(2026, 0, 5));
      await fireEvent.press(screen.getByRole("button", { name: "Save" }));
      await waitFor(() => expect(mockBack).toHaveBeenCalled());
      expect(lastPatch(server)).toEqual({ transaction_date: "2026-01-05", tax_year: 2026 });
    });
  });
});
