import { RECEIPT_GMAIL_STATE_MESSAGES, RECEIPT_SEND_BLOCKER_MESSAGES } from "@mybookkeeper/api-client/constants/receiptReadinessMessages";
import { rentReceiptsApi } from "@mybookkeeper/api-client/store/rentReceiptsApi";
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react-native";
import type { AxiosAdapter } from "axios";
import { router } from "expo-router";
import type { ReactNode } from "react";
import { Alert, Linking } from "react-native";
import { Provider } from "react-redux";
import { SHOWING_LAST_LOADED_MESSAGE } from "../src/constants/offline";
import { FIX_ON_WEBSITE, RECEIPTS_LIMIT, RECEIPTS_MESSAGES as MESSAGES } from "../src/constants/receipts";
import {
  blockerMessage,
  dismissActionLabel,
  gmailMessage,
  moreWaitingLine,
  periodLabel,
  reviewActionLabel,
  rowLabel,
  waitingLine,
} from "../src/features/receipts/receiptDisplay";
import ReceiptsScreen from "../src/features/receipts/ReceiptsScreen";
import { usePendingReceiptActions } from "../src/features/receipts/usePendingReceiptActions";
import { useCanWrite } from "../src/features/workspace/useCanWrite";
import { store } from "../src/lib/store";
import { aReceipt, startReceiptServer } from "../test-support/receiptsServer";

jest.mock("expo-router", () => ({ useFocusEffect: () => undefined, router: { push: jest.fn(), back: jest.fn() } }));
jest.mock("../src/features/workspace/useCanWrite", () => ({ useCanWrite: jest.fn() }));

const originalAdapter = api.defaults.adapter;

function Screen({ children }: { children: ReactNode }) {
  return (
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>{children}</ToastProvider>
    </Provider>
  );
}

async function showScreen() {
  await render(<ReceiptsScreen />, { wrapper: Screen });
  await act(async () => {
    await store.dispatch(rentReceiptsApi.endpoints.getPendingReceipts.initiate({ limit: RECEIPTS_LIMIT }, { forceRefetch: true }));
  });
  await settle();
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function pressAlert(button: string) {
  await act(async () => {
    jest.mocked(Alert.alert).mock.lastCall?.[2]?.find((option) => option.text === button)?.onPress?.();
  });
  await settle();
}

function sendButton() {
  return screen.getByRole("button", { name: /^Review & send/ });
}

beforeEach(() => {
  store.dispatch(baseApi.util.resetApiState());
  jest.mocked(useCanWrite).mockReturnValue(true);
  jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
  jest.mocked(router.push).mockClear();
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
  jest.restoreAllMocks();
});

describe("what the list shows", () => {
  it("shows the skeleton while it loads and nothing else", async () => {
    const adapter: AxiosAdapter = () => new Promise(() => undefined);
    api.defaults.adapter = adapter;
    await render(<ReceiptsScreen />, { wrapper: Screen });
    await settle();

    expect(screen.getByTestId("receipts-skeleton")).toBeTruthy();
    expect(screen.queryByText(MESSAGES.noneHeading)).toBeNull();
    expect(screen.queryByText(MESSAGES.couldntLoad)).toBeNull();
  });

  it("says caught up only when the server says nothing is waiting", async () => {
    startReceiptServer([]);
    await showScreen();

    expect(screen.getByText(MESSAGES.noneHeading)).toBeTruthy();
    expect(screen.getByText(MESSAGES.noneBody)).toBeTruthy();
  });

  it("offers a retry, never caught up, when the first load fails", async () => {
    const server = startReceiptServer([]);
    server.listStatus = 500;
    await showScreen();

    expect(screen.queryByText(MESSAGES.noneHeading)).toBeNull();
    expect(screen.getByText(MESSAGES.couldntLoad)).toBeTruthy();

    server.listStatus = null;
    await fireEvent.press(screen.getByText(MESSAGES.tryAgain));
    await settle();
    expect(screen.getByText(MESSAGES.noneHeading)).toBeTruthy();
  });

  it("keeps the list and says so when a refresh fails", async () => {
    const server = startReceiptServer([aReceipt()]);
    await showScreen();

    server.offline = true;
    await act(async () => {
      await screen.getByTestId("receipts-list").props.refreshControl.props.onRefresh();
    });

    expect(screen.getByText(SHOWING_LAST_LOADED_MESSAGE)).toBeTruthy();
    expect(screen.getByText("Jane Smith")).toBeTruthy();
  });

  it("says a failed refresh is showing the last answer, even when that answer was caught up", async () => {
    const server = startReceiptServer([]);
    await showScreen();
    expect(screen.getByText(MESSAGES.noneHeading)).toBeTruthy();

    server.offline = true;
    await act(async () => {
      await screen.getByTestId("receipts-list").props.refreshControl.props.onRefresh();
    });

    expect(screen.getByText(SHOWING_LAST_LOADED_MESSAGE)).toBeTruthy();
  });

  it("asks for every open receipt in one load, so a deep link can find its row", async () => {
    const server = startReceiptServer([aReceipt()]);
    await showScreen();

    expect(server.listReads[0].params).toEqual({ limit: RECEIPTS_LIMIT });
  });

  it("shows the tenant, amount, period, date and count", async () => {
    startReceiptServer([aReceipt(), aReceipt({ id: "pr2", transaction_id: "tx2", tenant_name: null, payer_name: "OMAR R", period_start_date: "2026-06-01", period_end_date: "2026-06-15" })]);
    await showScreen();

    expect(screen.getByText("2 receipts waiting to send")).toBeTruthy();
    expect(screen.getByText("Jane Smith")).toBeTruthy();
    expect(screen.getAllByText("$1,450.00")).toHaveLength(2);
    expect(screen.getByText("June 2026")).toBeTruthy();
    expect(screen.getByText("Jun 1 – Jun 15")).toBeTruthy();
    expect(screen.getAllByText("Received Jun 3")).toHaveLength(2);
    expect(screen.getByText("OMAR R")).toBeTruthy();
  });

  it("names a receipt with no name plainly", async () => {
    startReceiptServer([aReceipt({ tenant_name: null, payer_name: null })]);
    await showScreen();

    expect(screen.getByText(MESSAGES.unnamed)).toBeTruthy();
  });

  it("says how many more are waiting past the ones it loaded", async () => {
    const server = startReceiptServer([aReceipt()]);
    server.pendingCount = 4;
    await showScreen();

    expect(screen.getByText("4 receipts waiting to send")).toBeTruthy();
    expect(screen.getByText(moreWaitingLine(3))).toBeTruthy();
  });

  it("opens the send screen for that payment", async () => {
    startReceiptServer([aReceipt()]);
    await showScreen();

    await fireEvent.press(sendButton());
    expect(router.push).toHaveBeenCalledWith("/receipts/tx1");
  });

  it("says why a blocked receipt can't go, and turns its Send off", async () => {
    startReceiptServer([aReceipt({ send_blocker: "tenant_no_email" })]);
    await showScreen();

    expect(screen.getByText(`${RECEIPT_SEND_BLOCKER_MESSAGES.tenant_no_email} ${FIX_ON_WEBSITE}`)).toBeTruthy();
    expect(sendButton().props.accessibilityState.disabled).toBe(true);
  });

  it("offers Payment Review for a payment that isn't linked to a tenant", async () => {
    startReceiptServer([aReceipt({ send_blocker: "not_attributed" })]);
    await showScreen();

    expect(screen.getByText(RECEIPT_SEND_BLOCKER_MESSAGES.not_attributed)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.openPaymentReview }));
    expect(router.push).toHaveBeenCalledWith("/payment-review");
  });

  it("turns every Send off while Gmail can't send, and points to the website", async () => {
    const openURL = jest.spyOn(Linking, "openURL").mockImplementation(async () => undefined);
    const server = startReceiptServer([aReceipt(), aReceipt({ id: "pr2", transaction_id: "tx2" })]);
    server.gmailState = "needs_send_permission";
    await showScreen();

    expect(screen.getByText(`${RECEIPT_GMAIL_STATE_MESSAGES.needs_send_permission} ${FIX_ON_WEBSITE}`)).toBeTruthy();
    for (const button of screen.getAllByRole("button", { name: /^Review & send/ })) {
      expect(button.props.accessibilityState.disabled).toBe(true);
    }
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.openWebsite }));
    expect(openURL).toHaveBeenCalledWith("https://mybookkeeper.myfreeapps.org/integrations");
  });

  it("says an earlier send is being checked, keeps Send, and offers no Dismiss", async () => {
    startReceiptServer([aReceipt({ status: "sending" })]);
    await showScreen();

    expect(screen.getByText(MESSAGES.checkingWithGmail)).toBeTruthy();
    expect(sendButton().props.accessibilityState.disabled).toBe(false);
    expect(screen.queryByText(MESSAGES.dismiss)).toBeNull();
  });

  it("gives a viewer the list and no buttons", async () => {
    jest.mocked(useCanWrite).mockReturnValue(false);
    startReceiptServer([aReceipt()]);
    await showScreen();

    expect(screen.getByText(MESSAGES.viewOnly)).toBeTruthy();
    expect(screen.getByText("Jane Smith")).toBeTruthy();
    expect(screen.queryByText(MESSAGES.reviewAndSend)).toBeNull();
    expect(screen.queryByText(MESSAGES.dismiss)).toBeNull();
  });
});

describe("dismissing", () => {
  it("asks first, then takes the row off and says the payment stays", async () => {
    const server = startReceiptServer([aReceipt()]);
    await showScreen();

    await fireEvent.press(screen.getByText(MESSAGES.dismiss));
    expect(server.writes).toEqual([]);
    expect(jest.mocked(Alert.alert).mock.calls[0].slice(0, 2)).toEqual([MESSAGES.dismissTitle, MESSAGES.dismissBody]);

    await pressAlert(MESSAGES.dismiss);

    expect(server.writes).toEqual([{ url: "/rent-receipts/tx1/dismiss", body: {} }]);
    expect(screen.getByText(MESSAGES.dismissed)).toBeTruthy();
    expect(screen.getByText(MESSAGES.noneHeading)).toBeTruthy();
  });

  it("sends nothing when the question is cancelled", async () => {
    const server = startReceiptServer([aReceipt()]);
    await showScreen();

    await fireEvent.press(screen.getByText(MESSAGES.dismiss));
    await pressAlert("Cancel");

    expect(server.writes).toEqual([]);
    expect(screen.getByText("Jane Smith")).toBeTruthy();
  });

  it("takes the row off even when the reload after it fails", async () => {
    const server = startReceiptServer([aReceipt(), aReceipt({ id: "pr2", transaction_id: "tx2", tenant_name: "Omar Reyes", payer_name: null })]);
    await showScreen();
    server.listStatus = 500;

    await fireEvent.press(screen.getByRole("button", { name: dismissActionLabel(aReceipt()) }));
    await pressAlert(MESSAGES.dismiss);

    expect(screen.queryByText("Jane Smith")).toBeNull();
    expect(screen.getByText("Omar Reyes")).toBeTruthy();
    expect(screen.getByText("1 receipt waiting to send")).toBeTruthy();
  });

  it.each([
    [{ status: 422, detail: "Receipt is already sent" }, MESSAGES.dismissAlreadyHandled],
    [{ status: 404, detail: "No open receipt" }, MESSAGES.dismissGone],
  ])("drops a receipt that was already handled, with no error tone (%j)", async (reply, message) => {
    const server = startReceiptServer([aReceipt()]);
    server.dismissReply = reply;
    await showScreen();
    server.listStatus = 500;

    await fireEvent.press(screen.getByText(MESSAGES.dismiss));
    await pressAlert(MESSAGES.dismiss);

    expect(screen.getByText(message)).toBeTruthy();
    expect(screen.queryByText("Jane Smith")).toBeNull();
  });

  it("keeps the row and explains when a send is still being confirmed", async () => {
    const server = startReceiptServer([aReceipt()]);
    server.dismissReply = { status: 409, detail: "receipt_send_in_progress" };
    await showScreen();

    await fireEvent.press(screen.getByText(MESSAGES.dismiss));
    await pressAlert(MESSAGES.dismiss);

    expect(screen.getByText(MESSAGES.dismissWhileSending)).toBeTruthy();
    expect(screen.getByText("Jane Smith")).toBeTruthy();
  });

  it("never shows the server's words when a dismiss fails", async () => {
    const server = startReceiptServer([aReceipt()]);
    server.dismissReply = { status: 500, detail: "Traceback secret" };
    await showScreen();

    await fireEvent.press(screen.getByText(MESSAGES.dismiss));
    await pressAlert(MESSAGES.dismiss);

    expect(screen.getByText(MESSAGES.couldntDismiss)).toBeTruthy();
    expect(screen.queryByText(/Traceback/)).toBeNull();
    expect(screen.getByText("Jane Smith")).toBeTruthy();
  });

  it("sends one request when tapped twice before the button can disable itself", async () => {
    const server = startReceiptServer([aReceipt()]);
    const { result } = await renderHook(() => usePendingReceiptActions(aReceipt()), { wrapper: Screen });

    await act(async () => {
      await Promise.all([result.current.dismiss(), result.current.dismiss()]);
    });

    expect(server.writes).toHaveLength(1);
  });

});

describe("display helpers", () => {
  it("calls a whole calendar month by its name, and anything else by its days", () => {
    expect(periodLabel("2026-02-01", "2026-02-28")).toBe("February 2026");
    expect(periodLabel("2026-06-02", "2026-06-30")).toBe("Jun 2 – Jun 30");
    expect(periodLabel("2026-06-01", "2026-07-31")).toBe("Jun 1 – Jul 31");
    expect(periodLabel("2025-12-15", "2026-01-14")).toBe("Dec 15, 2025 – Jan 14, 2026");
  });

  it("adds where to fix it only when the fix is on the website", () => {
    expect(blockerMessage("tenant_no_email")).toContain(FIX_ON_WEBSITE);
    expect(blockerMessage("not_attributed")).toBe(RECEIPT_SEND_BLOCKER_MESSAGES.not_attributed);
    expect(blockerMessage("no_lease")).toBe(RECEIPT_SEND_BLOCKER_MESSAGES.no_lease);
    expect(gmailMessage("ready")).toBeNull();
    expect(gmailMessage("not_connected")).toContain(FIX_ON_WEBSITE);
  });

  it("starts each button's spoken label with its words and names the tenant", () => {
    expect(reviewActionLabel(aReceipt())).toBe("Review & send, the receipt for Jane Smith");
    expect(dismissActionLabel(aReceipt())).toBe("Dismiss the receipt for Jane Smith");
  });

  it("reads the whole receipt to a screen reader", () => {
    expect(rowLabel(aReceipt())).toBe("Jane Smith, 1,450 dollars, for June 2026, received June 3, 2026");
  });

  it("counts in the right number", () => {
    expect(waitingLine(1)).toBe("1 receipt waiting to send");
    expect(waitingLine(3)).toBe("3 receipts waiting to send");
  });
});
