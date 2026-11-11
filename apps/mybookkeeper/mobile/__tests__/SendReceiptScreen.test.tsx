import { DEMO_EMAIL_REFUSED } from "@mybookkeeper/api-client/constants/demoRefusal";
import { RECEIPT_GMAIL_STATE_MESSAGES, RECEIPT_SEND_BLOCKER_MESSAGES } from "@mybookkeeper/api-client/constants/receiptReadinessMessages";
import { RECEIPT_SEND_ERROR_MESSAGES } from "@mybookkeeper/api-client/constants/receiptSendErrorMessages";
import { rentReceiptsApi } from "@mybookkeeper/api-client/store/rentReceiptsApi";
import { localToday } from "@mybookkeeper/api-client/utils/localToday";
import type { PendingReceiptListResponse } from "@mybookkeeper/api-client/types/lease/pending-receipt-list-response";
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react-native";
import type { AxiosAdapter } from "axios";
import { router } from "expo-router";
import * as Sharing from "expo-sharing";
import type { ReactNode } from "react";
import { Alert } from "react-native";
import { Provider } from "react-redux";
import { FIX_ON_WEBSITE, RECEIPTS_LIMIT, RECEIPTS_MESSAGES as MESSAGES } from "../src/constants/receipts";
import SendReceiptScreen from "../src/features/receipts/SendReceiptScreen";
import { useSendReceipt } from "../src/features/receipts/useSendReceipt";
import { useCanWrite } from "../src/features/workspace/useCanWrite";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";
import { fakeDownloads, fakeFiles, resetFakeFiles } from "@platform/mobile/test-support/fakeFileSystem";
import { holdWrites } from "../test-support/holdWrites";
import { aReceipt, type FakeReceiptServer, startReceiptServer } from "../test-support/receiptsServer";

const mockPreventRemove = { active: false };
jest.mock("expo-router", () => ({
  useFocusEffect: () => undefined,
  router: { push: jest.fn(), back: jest.fn() },
  usePreventRemove: (active: boolean) => {
    mockPreventRemove.active = active;
  },
}));
jest.mock("expo-sharing", () => ({ shareAsync: jest.fn() }));
jest.mock("expo-file-system", () => jest.requireActual("@platform/mobile/test-support/fakeFileSystem"));
jest.mock("@react-native-community/datetimepicker", () => {
  const { View } = jest.requireActual("react-native");
  return { __esModule: true, default: View, DateTimePickerAndroid: { open: jest.fn() } };
});
jest.mock("../src/features/workspace/useCanWrite", () => ({ useCanWrite: jest.fn() }));
// The mocked answer drives the guard too, so these tests need no workspace list.
jest.mock("../src/features/workspace/useWriteAccess", () => ({
  useWriteAccess: () => (jest.requireMock("../src/features/workspace/useCanWrite").useCanWrite() ? "allowed" : "denied"),
}));
jest.mock("react-native/Libraries/Modal/Modal", () => ({
  __esModule: true,
  default: ({ visible, children }: { visible: boolean; children: unknown }) => (visible ? children : null),
}));

const originalAdapter = api.defaults.adapter;
const SENT = "Sent. Receipt R-2026-0007 is on its way to Jane Smith.";

function Screen({ children }: { children: ReactNode }) {
  return (
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>{children}</ToastProvider>
    </Provider>
  );
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function showScreen(transactionId = "tx1") {
  await render(<SendReceiptScreen transactionId={transactionId} />, { wrapper: Screen });
  await act(async () => {
    await store.dispatch(rentReceiptsApi.endpoints.getPendingReceipts.initiate({ limit: RECEIPTS_LIMIT }, { forceRefetch: true }));
  });
  await settle();
}

async function pressAlert(button: string) {
  await act(async () => {
    jest.mocked(Alert.alert).mock.lastCall?.[2]?.find((option) => option.text === button)?.onPress?.();
  });
  await settle();
}

function sendButton() {
  return screen.getByRole("button", { name: MESSAGES.sendReceipt });
}

async function sendAndConfirm() {
  await fireEvent.press(sendButton());
  await pressAlert(MESSAGES.sendReceipt);
}

function cachedList(): PendingReceiptListResponse | undefined {
  return store.getState().api.queries[`getPendingReceipts({"limit":${RECEIPTS_LIMIT}})`]?.data as PendingReceiptListResponse | undefined;
}

beforeEach(() => {
  session.tokenStore.set("token");
  store.dispatch(baseApi.util.resetApiState());
  jest.mocked(useCanWrite).mockReturnValue(true);
  jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
  jest.mocked(router.back).mockClear();
  jest.mocked(router.push).mockClear();
  jest.mocked(Sharing.shareAsync).mockReset();
  mockPreventRemove.active = false;
  resetFakeFiles();
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
  jest.restoreAllMocks();
});

describe("opening it", () => {
  it("shows a skeleton of the form on a cold load", async () => {
    const adapter: AxiosAdapter = () => new Promise(() => undefined);
    api.defaults.adapter = adapter;
    await render(<SendReceiptScreen transactionId="tx1" />, { wrapper: Screen });
    await settle();

    expect(screen.getByTestId("send-receipt-skeleton")).toBeTruthy();
    expect(screen.queryByText(MESSAGES.notWaitingHeading)).toBeNull();
  });

  it("offers a retry when the receipts won't load, rather than saying it's gone", async () => {
    const server = startReceiptServer([aReceipt()]);
    server.listStatus = 500;
    await showScreen();

    expect(screen.getByText(MESSAGES.couldntLoad)).toBeTruthy();
    expect(screen.queryByText(MESSAGES.notWaitingHeading)).toBeNull();

    server.listStatus = null;
    await fireEvent.press(screen.getByText(MESSAGES.tryAgain));
    await settle();
    expect(screen.getByText("Jane Smith")).toBeTruthy();
  });

  it("says a receipt that isn't in the list isn't waiting anymore", async () => {
    startReceiptServer([aReceipt()]);
    await showScreen("tx-other");

    expect(screen.getByText(MESSAGES.notWaitingHeading)).toBeTruthy();
    expect(screen.getByText(MESSAGES.notWaitingBody)).toBeTruthy();
    await fireEvent.press(screen.getByText(MESSAGES.goBack));
    expect(router.back).toHaveBeenCalled();
  });

  it("gives a viewer who follows a link a way back and no form", async () => {
    jest.mocked(useCanWrite).mockReturnValue(false);
    startReceiptServer([aReceipt()]);
    await showScreen();

    expect(screen.getByText(MESSAGES.viewOnlyHeading)).toBeTruthy();
    expect(screen.queryByText(MESSAGES.sendReceipt)).toBeNull();
    await fireEvent.press(screen.getByText(MESSAGES.goBack));
    expect(router.back).toHaveBeenCalled();
  });

  it("shows who, how much and when, and who paid only when it was someone else", async () => {
    startReceiptServer([aReceipt(), aReceipt({ id: "pr2", transaction_id: "tx2", payer_name: "Smith Family Trust" })]);
    await showScreen();

    expect(screen.getByText("Jane Smith")).toBeTruthy();
    expect(screen.getByText("$1,450.00")).toBeTruthy();
    expect(screen.getByText("Received Jun 3")).toBeTruthy();
    expect(screen.queryByText(/Paid by/)).toBeNull();

    await screen.unmount();
    await showScreen("tx2");
    expect(screen.getByText("Paid by Smith Family Trust")).toBeTruthy();
  });

  it("explains a blocked receipt at the top and turns Send off", async () => {
    startReceiptServer([aReceipt({ send_blocker: "not_attributed" })]);
    await showScreen();

    expect(screen.getByText(RECEIPT_SEND_BLOCKER_MESSAGES.not_attributed)).toBeTruthy();
    expect(sendButton().props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.openPaymentReview }));
    expect(router.push).toHaveBeenCalledWith("/payment-review");
  });

  it("turns Send off while Gmail can't send", async () => {
    const server = startReceiptServer([aReceipt()]);
    server.gmailState = "not_connected";
    await showScreen();

    expect(screen.getByText(`${RECEIPT_GMAIL_STATE_MESSAGES.not_connected} ${FIX_ON_WEBSITE}`)).toBeTruthy();
    expect(sendButton().props.accessibilityState.disabled).toBe(true);
  });
});

describe("the rent period", () => {
  it("starts at the receipt's period and opens one calendar at a time", async () => {
    startReceiptServer([aReceipt()]);
    await showScreen();

    expect(screen.queryByTestId("date-picker")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "From, Jun 1, 2026" }));
    expect(screen.getAllByTestId("date-picker")).toHaveLength(1);
    await fireEvent.press(screen.getByRole("button", { name: "To, Jun 30, 2026" }));
    expect(screen.getAllByTestId("date-picker")).toHaveLength(1);
    const { minimumDate } = screen.getByTestId("date-picker").props as { minimumDate: Date };
    expect(minimumDate).toEqual(new Date(2026, 5, 1));
    await fireEvent.press(screen.getByRole("button", { name: "To, Jun 30, 2026" }));
    expect(screen.queryByTestId("date-picker")).toBeNull();
  });

  it("won't send an end before the start, and says so without changing it", async () => {
    const server = startReceiptServer([aReceipt()]);
    await showScreen();

    await fireEvent.press(screen.getByRole("button", { name: "From, Jun 1, 2026" }));
    await act(async () => screen.getByTestId("date-picker").props.onChange({ type: "set" }, new Date(2026, 6, 5)));

    expect(screen.getByText("Pick an end date on or after Jul 5, 2026.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "To, Jun 30, 2026" })).toBeTruthy();
    expect(sendButton().props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(sendButton());
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(server.writes).toEqual([]);
  });

  it("sends the period that was picked", async () => {
    const server = startReceiptServer([aReceipt()]);
    await showScreen();

    await fireEvent.press(screen.getByRole("button", { name: "To, Jun 30, 2026" }));
    await act(async () => screen.getByTestId("date-picker").props.onChange({ type: "set" }, new Date(2026, 5, 15)));
    await sendAndConfirm();

    expect(server.writes[0].body).toEqual({ period_start: "2026-06-01", period_end: "2026-06-15", payment_method: "zelle", today: localToday() });
  });
});

describe("how they paid", () => {
  it("fills in a guess from the payment and says it's a guess", async () => {
    startReceiptServer([aReceipt()]);
    await showScreen();

    expect(screen.getByRole("button", { name: "How they paid, Zelle" })).toBeTruthy();
    expect(screen.getByText(MESSAGES.guessedMethod)).toBeTruthy();
  });

  it("drops the hint once it's changed, and can leave it off the receipt", async () => {
    const server = startReceiptServer([aReceipt()]);
    await showScreen();

    await fireEvent.press(screen.getByRole("button", { name: "How they paid, Zelle" }));
    expect(screen.getByText(MESSAGES.methodSheetTitle)).toBeTruthy();
    await fireEvent.press(screen.getByText("Cash"));
    expect(screen.getByRole("button", { name: "How they paid, Cash" })).toBeTruthy();
    expect(screen.queryByText(MESSAGES.guessedMethod)).toBeNull();

    await fireEvent.press(screen.getByRole("button", { name: "How they paid, Cash" }));
    await fireEvent.press(screen.getByText(MESSAGES.leaveItOff));
    await sendAndConfirm();

    expect(server.writes[0].body).toEqual({ period_start: "2026-06-01", period_end: "2026-06-30", payment_method: null, today: localToday() });
  });

  it("guesses nothing when the payment says nothing", async () => {
    startReceiptServer([aReceipt({ vendor: "Transfer 4471", payment_method: null })]);
    await showScreen();

    expect(screen.getByRole("button", { name: `How they paid, ${MESSAGES.leaveItOff}` })).toBeTruthy();
    expect(screen.queryByText(MESSAGES.guessedMethod)).toBeNull();
  });
});

describe("previewing", () => {
  it("downloads the PDF as it would go out, shares it, then removes the copy", async () => {
    startReceiptServer([aReceipt()]);
    await showScreen();

    expect(screen.getByText(MESSAGES.previewHint)).toBeTruthy();
    await fireEvent.press(screen.getByText(MESSAGES.previewPdf));
    await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalledTimes(1));

    expect(fakeDownloads()).toEqual([
      `https://mybookkeeper.myfreeapps.org/api/rent-receipts/preview/tx1?period_start=2026-06-01&period_end=2026-06-30&payment_method=zelle&today=${localToday()}`,
    ]);
    expect(jest.mocked(Sharing.shareAsync).mock.calls[0][0]).toBe("cache:/documents/receipt-tx1.pdf");
    await waitFor(() => expect(fakeFiles()).toEqual([]));
  });

  it("says so when the preview can't be made", async () => {
    startReceiptServer([aReceipt()]);
    jest.mocked(Sharing.shareAsync).mockRejectedValue(new Error("no"));
    await showScreen();

    await fireEvent.press(screen.getByText(MESSAGES.previewPdf));
    expect(await screen.findByText(MESSAGES.previewFailed)).toBeTruthy();
    expect(fakeFiles()).toEqual([]);
  });
});

describe("sending", () => {
  it("asks first, naming who, how much and for when", async () => {
    const server = startReceiptServer([aReceipt()]);
    await showScreen();

    await fireEvent.press(sendButton());

    expect(server.writes).toEqual([]);
    expect(jest.mocked(Alert.alert).mock.calls[0].slice(0, 2)).toEqual([
      "Email Jane Smith a receipt?",
      "I'll email a $1,450.00 receipt for June 2026 to Jane Smith and save a copy with their lease. I can't unsend it.",
    ]);
    expect(jest.mocked(Alert.alert).mock.calls[0][2]?.map((option) => option.text)).toEqual(["Cancel", MESSAGES.sendReceipt]);
  });

  it("says this tenant when it has no name", async () => {
    startReceiptServer([aReceipt({ tenant_name: null, payer_name: null })]);
    await showScreen();

    await fireEvent.press(sendButton());
    expect(jest.mocked(Alert.alert).mock.calls[0][0]).toBe("Email this tenant a receipt?");
  });

  it("sends nothing when the question is cancelled", async () => {
    const server = startReceiptServer([aReceipt()]);
    await showScreen();

    await fireEvent.press(sendButton());
    await pressAlert("Cancel");

    expect(server.writes).toEqual([]);
    expect(router.back).not.toHaveBeenCalled();
  });

  it("asks once when tapped twice", async () => {
    startReceiptServer([aReceipt()]);
    await showScreen();

    await fireEvent.press(sendButton());
    await fireEvent.press(sendButton());
    expect(Alert.alert).toHaveBeenCalledTimes(1);
  });

  it("sends one request when sent twice before the button can disable itself", async () => {
    const server = startReceiptServer([aReceipt()]);
    const { result } = await renderHook(() => useSendReceipt(async () => null), { wrapper: Screen });
    const values = { periodStart: "2026-06-01", periodEnd: "2026-06-30", paymentMethod: "" };

    await act(async () => {
      await Promise.all([result.current.send(aReceipt(), values), result.current.send(aReceipt(), values)]);
    });

    expect(server.writes).toHaveLength(1);
  });

  it("sends, takes it off the list even if the reload fails, says so, and goes back", async () => {
    const server = startReceiptServer([aReceipt(), aReceipt({ id: "pr2", transaction_id: "tx2" })]);
    await showScreen();
    server.listStatus = 500;

    await sendAndConfirm();

    expect(server.writes).toEqual([{ url: "/rent-receipts/tx1/send", body: { period_start: "2026-06-01", period_end: "2026-06-30", payment_method: "zelle", today: localToday() } }]);
    expect(screen.getByText(SENT)).toBeTruthy();
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(cachedList()?.items.map((item) => item.transaction_id)).toEqual(["tx2"]);
    expect(cachedList()?.pending_count).toBe(1);
    // Still the form, not "isn't waiting anymore", while the screen goes.
    expect(screen.queryByText(MESSAGES.notWaitingHeading)).toBeNull();
  });

  it("can't be left while it's sending", async () => {
    startReceiptServer([aReceipt()]);
    await showScreen();
    holdWrites();

    expect(mockPreventRemove.active).toBe(false);
    await sendAndConfirm();

    expect(mockPreventRemove.active).toBe(true);
    expect(screen.getByText(MESSAGES.sending)).toBeTruthy();
  });
});

describe("when the send is refused", () => {
  async function sendWith(server: FakeReceiptServer, reply: { status: number; detail?: string }) {
    server.sendReply = reply;
    await showScreen();
    await sendAndConfirm();
  }

  it.each([
    ["receipt_already_sent", RECEIPT_SEND_ERROR_MESSAGES.receipt_already_sent],
    ["receipt_dismissed", RECEIPT_SEND_ERROR_MESSAGES.receipt_dismissed],
  ])("goes back when it's already finished (%s)", async (detail, message) => {
    const server = startReceiptServer([aReceipt()]);
    await sendWith(server, { status: 409, detail });

    expect(screen.getByText(message)).toBeTruthy();
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it("goes back when it's gone", async () => {
    const server = startReceiptServer([aReceipt()]);
    await sendWith(server, { status: 404, detail: "Not found" });

    expect(screen.getByText(MESSAGES.gone)).toBeTruthy();
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it.each([
    [409, "receipt_send_in_progress", RECEIPT_SEND_ERROR_MESSAGES.receipt_send_in_progress],
    [502, "receipt_send_unconfirmed", RECEIPT_SEND_ERROR_MESSAGES.receipt_send_unconfirmed],
    [500, "receipt_sent_not_recorded", RECEIPT_SEND_ERROR_MESSAGES.receipt_sent_not_recorded],
    [502, "invalid_grant: Bad Request", MESSAGES.gmailRefused],
    [500, "Traceback secret", MESSAGES.couldntSend],
    [403, "Write access required", MESSAGES.viewerRefused],
    [403, "This feature is not available for demo accounts", DEMO_EMAIL_REFUSED],
  ])("stays and explains a %i %s in its own words", async (status, detail, message) => {
    const server = startReceiptServer([aReceipt()]);
    await sendWith(server, { status, detail });

    expect(screen.getByText(message)).toBeTruthy();
    expect(screen.queryByText(detail)).toBeNull();
    expect(router.back).not.toHaveBeenCalled();
    expect(sendButton().props.accessibilityState.disabled).toBe(false);
  });

  it("reloads on a 422 and explains it by the receipt's own reason", async () => {
    const server = startReceiptServer([aReceipt()]);
    server.beforeListRead = () => {
      if (server.writes.length > 0) server.receipts = [aReceipt({ send_blocker: "tenant_no_email" })];
    };
    await sendWith(server, { status: 422, detail: "This tenant has no email on file." });

    expect(screen.getByText(`${RECEIPT_SEND_BLOCKER_MESSAGES.tenant_no_email} ${FIX_ON_WEBSITE}`)).toBeTruthy();
    expect(screen.queryByText("This tenant has no email on file.")).toBeNull();
    expect(sendButton().props.accessibilityState.disabled).toBe(true);
  });

  it("reloads on a 422 and explains it by Gmail when that's why", async () => {
    const server = startReceiptServer([aReceipt()]);
    server.beforeListRead = () => {
      if (server.writes.length > 0) server.gmailState = "needs_reconnect";
    };
    await sendWith(server, { status: 422, detail: "Gmail needs reconnecting." });

    expect(screen.getByText(`${RECEIPT_GMAIL_STATE_MESSAGES.needs_reconnect} ${FIX_ON_WEBSITE}`)).toBeTruthy();
    expect(sendButton().props.accessibilityState.disabled).toBe(true);
  });

  it("says it couldn't send a 422 the reload doesn't explain", async () => {
    const server = startReceiptServer([aReceipt()]);
    await sendWith(server, { status: 422, detail: "Something new" });

    expect(server.listReads.length).toBeGreaterThan(1);
    expect(screen.getByText(MESSAGES.couldntSend)).toBeTruthy();
    expect(screen.queryByText("Something new")).toBeNull();
  });

  it("asks to reconnect Gmail on the website when its sign-in has lapsed", async () => {
    const server = startReceiptServer([aReceipt()]);
    await sendWith(server, { status: 503, detail: "gmail_reauth_required" });

    expect(screen.getByText(`${RECEIPT_SEND_ERROR_MESSAGES.gmail_reauth_required} ${FIX_ON_WEBSITE}`)).toBeTruthy();
  });
});

describe("when no answer comes back", () => {
  it("says it's off the list, without claiming it was sent, when the receipt has left the list", async () => {
    const server = startReceiptServer([aReceipt()]);
    server.sendReply = "noAnswer";
    server.sendLandsAnyway = true;
    await showScreen();

    await sendAndConfirm();

    expect(screen.getByText(MESSAGES.offList)).toBeTruthy();
    expect(screen.queryByText(/^Sent\./)).toBeNull();
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it("says it can't tell yet, and that trying again is safe, when it's still listed", async () => {
    const server = startReceiptServer([aReceipt()]);
    server.sendReply = "noAnswer";
    await showScreen();

    await sendAndConfirm();

    expect(screen.getByText(MESSAGES.sendUnsure)).toBeTruthy();
    expect(router.back).not.toHaveBeenCalled();
    expect(sendButton().props.accessibilityState.disabled).toBe(false);
  });

  it("says it can't tell yet when the list won't load either", async () => {
    const server = startReceiptServer([aReceipt()]);
    server.sendReply = "noAnswer";
    server.sendLandsAnyway = true;
    await showScreen();
    server.listStatus = 500;

    await sendAndConfirm();

    expect(screen.getByText(MESSAGES.sendUnsure)).toBeTruthy();
    expect(router.back).not.toHaveBeenCalled();
  });
});
