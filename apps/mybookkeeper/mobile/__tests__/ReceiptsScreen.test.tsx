import { RECEIPT_GMAIL_STATE_MESSAGES, RECEIPT_SEND_BLOCKER_MESSAGES } from "@mybookkeeper/api-client/constants/receiptReadinessMessages";
import { rentReceiptsApi } from "@mybookkeeper/api-client/store/rentReceiptsApi";
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { SHOWING_LAST_LOADED_MESSAGE, ToastProvider } from "@platform/mobile";
import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react-native";
import type { AxiosAdapter } from "axios";
import { router } from "expo-router";
import type { ReactNode } from "react";
import { Alert } from "react-native";
import { openAuthSessionAsync } from "expo-web-browser";
import { Provider } from "react-redux";
import { GMAIL_CONNECT_MESSAGES, GMAIL_CONNECT_RETURN_URL } from "../src/constants/gmailConnect";
import { PENDING_RECEIPT_PAGE_SIZE } from "@mybookkeeper/api-client/constants/receiptPaging";
import { BLOCKER_FIX_ON_PHONE, RECONNECT_IN_INTEGRATIONS, RECEIPTS_MESSAGES as MESSAGES } from "../src/constants/receipts";
import {
  blockerMessage,
  dismissActionLabel,
  gmailMessage,
  periodLabel,
  reviewActionLabel,
  rowLabel,
} from "../src/features/receipts/receiptDisplay";
import ReceiptsScreen from "../src/features/receipts/ReceiptsScreen";
import { usePendingReceiptActions } from "../src/features/receipts/usePendingReceiptActions";
import { useCanWrite } from "../src/features/workspace/useCanWrite";
import { store } from "../src/lib/store";
import { receiptSentFromOtherGmailMessage } from "@mybookkeeper/api-client/utils/receiptSentFromOtherGmailMessage";
import { aReceipt, cachedReceiptPages, startReceiptServer } from "../test-support/receiptsServer";
import { SHOWN } from "@platform/mobile/test-support/shown";

jest.mock("expo-router", () => ({ useFocusEffect: () => undefined, router: { push: jest.fn(), back: jest.fn(), canGoBack: () => true } }));
jest.mock("../src/features/workspace/useCanWrite", () => ({ useCanWrite: jest.fn() }));
jest.mock("expo-web-browser", () => ({ openAuthSessionAsync: jest.fn() }));

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
    // Joins the screen's own first load, so the test waits for its answer.
    await store.dispatch(rentReceiptsApi.endpoints.listPendingReceiptPages.initiate());
  });
  await waitFor(() => expect(screen.queryByTestId("receipts-skeleton")).toBeNull());
}

function manyReceipts(count: number) {
  return Array.from({ length: count }, (_, index) =>
    aReceipt({ id: `pr${index + 1}`, transaction_id: `tx${index + 1}`, tenant_name: `Tenant ${index + 1}`, payer_name: null }),
  );
}

function listedRows(): unknown[] {
  return screen.getByTestId("receipts-list").props.data as unknown[];
}

async function reachEnd() {
  await act(async () => {
    await screen.getByTestId("receipts-list").props.onEndReached();
  });
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
    expect(await screen.findByText(MESSAGES.noneHeading)).toBeTruthy();
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

  it("asks for the first page by offset, never for more than the server answers", async () => {
    const server = startReceiptServer([aReceipt()]);
    await showScreen();

    expect(server.listReads.map((read) => read.params)).toEqual([{ limit: PENDING_RECEIPT_PAGE_SIZE, offset: 0 }]);
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

  it("counts every open receipt, and loads the rest a page at a time as the list reaches its end", async () => {
    const count = PENDING_RECEIPT_PAGE_SIZE * 2 + 5;
    const server = startReceiptServer(manyReceipts(count));
    await showScreen();

    expect(screen.getByText(`${count} receipts waiting to send`)).toBeTruthy();
    expect(listedRows()).toHaveLength(PENDING_RECEIPT_PAGE_SIZE);
    for (let loaded = PENDING_RECEIPT_PAGE_SIZE; loaded < count; loaded += PENDING_RECEIPT_PAGE_SIZE) {
      await reachEnd();
      await waitFor(() => expect(listedRows()).toHaveLength(Math.min(loaded + PENDING_RECEIPT_PAGE_SIZE, count)));
    }

    expect(server.listReads.map((read) => (read.params as { offset: number }).offset)).toEqual([0, 25, 50]);
    expect(screen.queryByText("I couldn't load more.")).toBeNull();
  });

  it("lists a receipt from the second page once it loads", async () => {
    startReceiptServer(manyReceipts(PENDING_RECEIPT_PAGE_SIZE + 3));
    await showScreen();
    const onSecondPage = `tx${PENDING_RECEIPT_PAGE_SIZE + 2}`;
    expect(listedRows().map((row) => (row as { transaction_id: string }).transaction_id)).not.toContain(onSecondPage);

    await reachEnd();

    await waitFor(() => expect(listedRows().map((row) => (row as { transaction_id: string }).transaction_id)).toContain(onSecondPage));
  });

  it("keeps its receipts when the next page fails, and Try again loads it", async () => {
    const server = startReceiptServer(manyReceipts(PENDING_RECEIPT_PAGE_SIZE + 3));
    await showScreen();
    server.listStatus = 500;
    await reachEnd();

    expect(await screen.findByText("I couldn't load more.")).toBeTruthy();
    expect(listedRows()).toHaveLength(PENDING_RECEIPT_PAGE_SIZE);
    expect(screen.queryByText(SHOWING_LAST_LOADED_MESSAGE)).toBeNull();

    server.listStatus = null;
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.tryAgain }));
    await waitFor(() => expect(listedRows()).toHaveLength(PENDING_RECEIPT_PAGE_SIZE + 3));
    expect(screen.queryByText("I couldn't load more.")).toBeNull();
  });

  it("takes a dismissed receipt on the second page off the loaded pages and their count, even when the reload fails", async () => {
    const server = startReceiptServer(manyReceipts(PENDING_RECEIPT_PAGE_SIZE + 3));
    await showScreen();
    await reachEnd();
    await waitFor(() => expect(listedRows()).toHaveLength(PENDING_RECEIPT_PAGE_SIZE + 3));
    server.listStatus = 500;

    const target = aReceipt({ transaction_id: `tx${PENDING_RECEIPT_PAGE_SIZE + 2}`, tenant_name: `Tenant ${PENDING_RECEIPT_PAGE_SIZE + 2}`, payer_name: null });
    // The list only draws the rows near the top, so the dismiss runs through the row's own hook.
    const { result } = await renderHook(() => usePendingReceiptActions(target), { wrapper: Screen });
    await act(async () => {
      await result.current.dismiss();
    });

    // The reload after it failed, so this is the dropped row alone.
    const pages = cachedReceiptPages(store.getState());
    const kept = pages.flatMap((page) => page.items.map((item) => item.transaction_id));
    expect(kept).toHaveLength(PENDING_RECEIPT_PAGE_SIZE + 2);
    expect(kept).not.toContain(target.transaction_id);
    expect(pages.map((page) => page.total)).toEqual([PENDING_RECEIPT_PAGE_SIZE + 2, PENDING_RECEIPT_PAGE_SIZE + 2]);
  });

  it("opens the send screen for that payment", async () => {
    startReceiptServer([aReceipt()]);
    await showScreen();

    await fireEvent.press(sendButton());
    expect(router.push).toHaveBeenCalledWith("/receipts/tx1");
  });

  it("says why a blocked receipt can't go, turns its Send off, and opens the tenant to add their email", async () => {
    startReceiptServer([aReceipt({ send_blocker: "tenant_no_email", applicant_id: "a7" })]);
    await showScreen();

    expect(screen.getByText(`${RECEIPT_SEND_BLOCKER_MESSAGES.tenant_no_email} ${BLOCKER_FIX_ON_PHONE.tenant_no_email}`)).toBeTruthy();
    expect(screen.queryByText(new RegExp(RECONNECT_IN_INTEGRATIONS))).toBeNull();
    expect(sendButton().props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.addTheirEmail }));
    expect(router.push).toHaveBeenCalledWith("/applicants/a7");
  });

  it("offers Payment Review for a payment that isn't linked to a tenant", async () => {
    startReceiptServer([aReceipt({ send_blocker: "not_attributed" })]);
    await showScreen();

    expect(screen.getByText(RECEIPT_SEND_BLOCKER_MESSAGES.not_attributed)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.openPaymentReview }));
    expect(router.push).toHaveBeenCalledWith("/payment-review");
  });

  it("turns every Send off while Gmail can't send, and turns them back on once it's reconnected here", async () => {
    const server = startReceiptServer([aReceipt(), aReceipt({ id: "pr2", transaction_id: "tx2" })]);
    server.gmailState = "needs_send_permission";
    await showScreen();

    expect(screen.getByText(RECEIPT_GMAIL_STATE_MESSAGES.needs_send_permission)).toBeTruthy();
    expect(screen.queryByText(/website/)).toBeNull();
    for (const button of screen.getAllByRole("button", { name: /^Review & send/ })) {
      expect(button.props.accessibilityState.disabled).toBe(true);
    }
    jest.mocked(openAuthSessionAsync).mockImplementation(async () => {
      server.gmailState = "ready";
      return { type: "success", url: `${GMAIL_CONNECT_RETURN_URL}?result=connected` };
    });
    await fireEvent.press(screen.getByRole("button", { name: GMAIL_CONNECT_MESSAGES.reconnect }));

    expect(server.connectStarts.map((request) => request.params)).toEqual([{ client: "mobile" }]);
    await waitFor(() => expect(screen.queryByText(RECEIPT_GMAIL_STATE_MESSAGES.needs_send_permission)).toBeNull());
    for (const button of screen.getAllByRole("button", { name: /^Review & send/ })) {
      expect(button.props.accessibilityState.disabled).toBe(false);
    }
  });

  it("offers to connect Gmail when it isn't connected", async () => {
    const server = startReceiptServer([aReceipt()]);
    server.gmailState = "not_connected";
    await showScreen();

    expect(screen.getByText(RECEIPT_GMAIL_STATE_MESSAGES.not_connected)).toBeTruthy();
    expect(screen.getByRole("button", { name: GMAIL_CONNECT_MESSAGES.connect })).toBeTruthy();
    expect(screen.queryByRole("button", { name: GMAIL_CONNECT_MESSAGES.reconnect })).toBeNull();
  });

  it("says an earlier send is being checked, keeps Send, and offers no Dismiss", async () => {
    startReceiptServer([aReceipt({ status: "sending" })]);
    await showScreen();

    expect(screen.getByText(MESSAGES.checkingWithGmail)).toBeTruthy();
    expect(sendButton().props.accessibilityState.disabled).toBe(false);
    expect(screen.queryByText(MESSAGES.dismiss)).toBeNull();
  });

  it("names the account a stuck send went through, offers no Send, and lets it be dismissed after a stronger warning", async () => {
    const server = startReceiptServer([aReceipt({ status: "sending", sent_from_other_gmail: "old@gmail.com" })]);
    await showScreen();

    expect(screen.getByText(`${receiptSentFromOtherGmailMessage("old@gmail.com")} ${RECONNECT_IN_INTEGRATIONS}`)).toBeTruthy();
    expect(screen.queryByText(MESSAGES.checkingWithGmail)).toBeNull();
    expect(screen.queryByText(MESSAGES.reviewAndSend)).toBeNull();

    await fireEvent.press(screen.getByText(MESSAGES.dismiss));
    expect(jest.mocked(Alert.alert).mock.calls[0].slice(0, 2)).toEqual([MESSAGES.dismissTitle, MESSAGES.dismissOtherGmailBody]);
    await pressAlert(MESSAGES.dismiss);

    expect(await screen.findByText(MESSAGES.noneHeading)).toBeTruthy();
    expect(server.writes).toEqual([{ url: "/rent-receipts/tx1/dismiss", body: {} }]);
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

    expect(await screen.findByText(MESSAGES.noneHeading)).toBeTruthy();
    expect(server.writes).toEqual([{ url: "/rent-receipts/tx1/dismiss", body: {} }]);
    expect(screen.getByText(MESSAGES.dismissed)).toBeTruthy();
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

    expect(await screen.findByText("1 receipt waiting to send")).toBeTruthy();
    expect(screen.queryByText("Jane Smith")).toBeNull();
    expect(screen.getByText("Omar Reyes")).toBeTruthy();
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

    expect(await screen.findByText(message)).toBeTruthy();
    await waitFor(() => expect(screen.queryByText("Jane Smith")).toBeNull());
  });

  it("keeps the row and explains when a send is still being confirmed", async () => {
    const server = startReceiptServer([aReceipt()]);
    server.dismissReply = { status: 409, detail: "receipt_send_in_progress" };
    await showScreen();

    await fireEvent.press(screen.getByText(MESSAGES.dismiss));
    await pressAlert(MESSAGES.dismiss);

    expect(await screen.findByText(MESSAGES.dismissWhileSending)).toBeTruthy();
    expect(screen.getByText("Jane Smith")).toBeTruthy();
  });

  it("never shows the server's words when a dismiss fails", async () => {
    const server = startReceiptServer([aReceipt()]);
    server.dismissReply = { status: 500, detail: "Traceback secret" };
    await showScreen();

    await fireEvent.press(screen.getByText(MESSAGES.dismiss));
    await pressAlert(MESSAGES.dismiss);

    expect(await screen.findByText(MESSAGES.couldntDismiss)).toBeTruthy();
    expect(screen.queryByText(/Traceback/, SHOWN)).toBeNull();
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

  it("says where on the phone to fix a blocker, and gives Gmail's state on its own", () => {
    expect(blockerMessage("tenant_no_email")).toContain(BLOCKER_FIX_ON_PHONE.tenant_no_email);
    expect(blockerMessage("tenant_no_email")).not.toContain(RECONNECT_IN_INTEGRATIONS);
    expect(blockerMessage("not_attributed")).toBe(RECEIPT_SEND_BLOCKER_MESSAGES.not_attributed);
    expect(blockerMessage("no_lease")).toBe(RECEIPT_SEND_BLOCKER_MESSAGES.no_lease);
    expect(gmailMessage("ready")).toBeNull();
    expect(gmailMessage("not_connected")).toBe(RECEIPT_GMAIL_STATE_MESSAGES.not_connected);
  });

  it("starts each button's spoken label with its words and names the tenant", () => {
    expect(reviewActionLabel(aReceipt())).toBe("Review & send, the receipt for Jane Smith");
    expect(dismissActionLabel(aReceipt())).toBe("Dismiss the receipt for Jane Smith");
  });

  it("reads the whole receipt to a screen reader", () => {
    expect(rowLabel(aReceipt())).toBe("Jane Smith, 1,450 dollars, for June 2026, received June 3, 2026");
  });
});
