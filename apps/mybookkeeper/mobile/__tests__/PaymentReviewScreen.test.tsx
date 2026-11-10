import { attributionApi } from "@mybookkeeper/api-client/store/attributionApi";
import { transactionsApi } from "@mybookkeeper/api-client/store/transactionsApi";
import type { AttributionReviewItem } from "@mybookkeeper/api-client/types/attribution/attribution-review-item";
import type { AttributionReviewQueueResponse } from "@mybookkeeper/api-client/types/attribution/attribution-review-queue-response";
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { SHOWING_LAST_LOADED_MESSAGE, ToastProvider } from "@platform/mobile";
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react-native";
import type { AxiosAdapter, AxiosRequestConfig } from "axios";
import type { ReactNode } from "react";
import { Alert } from "react-native";
import { Provider } from "react-redux";
import { PAYMENT_REVIEW_MESSAGES as MESSAGES, PAYMENT_REVIEW_SERVER_DETAILS as DETAILS } from "../src/constants/paymentReview";
import { TENANT_PICKER_MESSAGES } from "../src/constants/tenantPicker";
import { confirmActionLabel, isPayout, moreWaitingLine, pickActionLabel, proposedTarget, queueCountLine, rowLabel, skipActionLabel } from "../src/features/paymentReview/paymentReviewDisplay";
import { reviewFailureMessage, wasAlreadyHandled } from "../src/features/paymentReview/paymentReviewFailure";
import PaymentReviewScreen from "../src/features/paymentReview/PaymentReviewScreen";
import { usePaymentReviewActions } from "../src/features/paymentReview/usePaymentReviewActions";
import { useCanWrite } from "../src/features/workspace/useCanWrite";
import { store } from "../src/lib/store";

jest.mock("expo-router", () => ({ useFocusEffect: () => undefined, router: { push: jest.fn(), back: jest.fn() } }));
jest.mock("../src/features/workspace/useCanWrite", () => ({ useCanWrite: jest.fn() }));

const mockModal: { onDismiss?: () => void } = {};
jest.mock("react-native/Libraries/Modal/Modal", () => ({
  __esModule: true,
  default: ({ visible, onDismiss, children }: { visible: boolean; onDismiss?: () => void; children: unknown }) => {
    if (onDismiss) mockModal.onDismiss = onDismiss;
    return visible ? children : null;
  },
}));

const QUEUE_URL = "/transactions/attribution-review-queue";
const originalAdapter = api.defaults.adapter;

function aRow(overrides: Partial<AttributionReviewItem> = {}): AttributionReviewItem {
  return {
    id: "r1",
    transaction_id: "tx1",
    proposed_applicant_id: "a1",
    proposed_property_id: null,
    confidence: "fuzzy",
    status: "pending",
    created_at: "2026-03-03T12:00:00Z",
    resolved_at: null,
    transaction: {
      id: "tx1",
      transaction_date: "2026-03-03",
      amount: "1200.00",
      vendor: "Zelle",
      payer_name: "Jane S.",
      description: "March rent",
      property_id: null,
      channel: null,
    },
    proposed_applicant: { id: "a1", legal_name: "Jane Smith" },
    proposed_property: null,
    ...overrides,
  };
}

function aPayout(overrides: Partial<AttributionReviewItem> = {}): AttributionReviewItem {
  const row = aRow();
  return aRow({
    id: "r2",
    proposed_applicant_id: null,
    proposed_applicant: null,
    proposed_property_id: "p1",
    proposed_property: { id: "p1", name: "Sunset Villa" },
    transaction: row.transaction && { ...row.transaction, channel: "airbnb", payer_name: null, vendor: "Airbnb" },
    ...overrides,
  });
}

function aQueue(items: AttributionReviewItem[], pending = items.length): AttributionReviewQueueResponse {
  return { items, total: items.length, pending_count: pending };
}

interface Reply {
  status: number;
  data?: unknown;
}

function refusal(status: number, detail: string): { status: number; data: { detail: string } } {
  return { status, data: { detail } };
}

interface Server {
  queue: AttributionReviewQueueResponse;
  sent: { url: string; body: unknown }[];
  reply?: Reply;
  queueStatus?: number;
  dead?: boolean;
  tenantsFail?: boolean;
  queueReads: number;
  tenantReads: number;
  propertyReads: number;
  otherReads: string[];
}

function serve(queue: AttributionReviewQueueResponse): Server {
  const server: Server = { queue, sent: [], queueReads: 0, tenantReads: 0, propertyReads: 0, otherReads: [] };
  const adapter: AxiosAdapter = async (config: AxiosRequestConfig & { url?: string }) => {
    const url = config.url ?? "";
    const respond = (status: number, data: unknown) => {
      const response = { data, status, statusText: "", headers: {}, config } as never;
      if (status >= 400) throw Object.assign(new Error("refused"), { isAxiosError: true, response, config });
      return response;
    };
    if (server.dead) throw Object.assign(new Error("Network Error"), { isAxiosError: true, config });
    if (url === QUEUE_URL) {
      server.queueReads += 1;
      return server.queueStatus ? respond(server.queueStatus, {}) : respond(200, server.queue);
    }
    if (url === "/applicants/tenants") {
      server.tenantReads += 1;
      if (server.tenantsFail) return respond(500, {});
      return respond(200, {
        items: [
          { id: "a1", legal_name: "Jane Smith", tenant_ended_at: null, contract_end: "2099-01-01" },
          { id: "a2", legal_name: "Omar Reyes", tenant_ended_at: null, contract_end: "2099-01-01" },
          { id: "a3", legal_name: "Past Person", tenant_ended_at: "2020-01-01T00:00:00Z", contract_end: "2020-01-01" },
        ],
        total: 3,
        has_more: false,
      });
    }
    if (url === "/properties") {
      server.propertyReads += 1;
      return respond(200, [
        { id: "p1", name: "Sunset Villa", is_active: true },
        { id: "p2", name: "Oak Cottage", is_active: true },
        { id: "p3", name: "Sold House", is_active: false },
      ]);
    }
    if (url.startsWith(`${QUEUE_URL}/`)) {
      server.sent.push({ url, body: JSON.parse(String(config.data)) });
      if (server.reply) return respond(server.reply.status, server.reply.data ?? {});
      const id = url.split("/")[3];
      server.queue = aQueue(server.queue.items.filter((item) => item.id !== id));
      return respond(200, { ok: true, transaction_id: "tx1" });
    }
    server.otherReads.push(url);
    return respond(200, {});
  };
  api.defaults.adapter = adapter;
  return server;
}

function Screen({ children }: { children: ReactNode }) {
  return (
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>{children}</ToastProvider>
    </Provider>
  );
}

async function showScreen() {
  await render(<PaymentReviewScreen />, { wrapper: Screen });
  await act(async () => {
    await store.dispatch(attributionApi.endpoints.getAttributionReviewQueue.initiate(undefined, { forceRefetch: true }));
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

async function finishClosing() {
  await act(async () => mockModal.onDismiss?.());
  await settle();
}

beforeEach(() => {
  store.dispatch(baseApi.util.resetApiState());
  jest.mocked(useCanWrite).mockReturnValue(true);
  jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
  mockModal.onDismiss = undefined;
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
  jest.restoreAllMocks();
});

describe("what the list shows", () => {
  it("shows the skeleton while it loads and hides nothing behind it", async () => {
    const adapter: AxiosAdapter = () => new Promise(() => undefined);
    api.defaults.adapter = adapter;
    await render(<PaymentReviewScreen />, { wrapper: Screen });
    await settle();

    expect(screen.getByTestId("payment-review-skeleton")).toBeTruthy();
    expect(screen.queryByText(MESSAGES.noneHeading)).toBeNull();
    expect(screen.queryByText(MESSAGES.couldntLoad)).toBeNull();
  });

  it("says caught up only when the server said so", async () => {
    serve(aQueue([]));
    await showScreen();

    expect(screen.getByText(MESSAGES.noneHeading)).toBeTruthy();
    expect(screen.queryByText(MESSAGES.couldntLoad)).toBeNull();
  });

  it("offers a retry rather than caught up when the first load fails", async () => {
    const server = serve(aQueue([]));
    server.queueStatus = 500;
    await showScreen();

    expect(screen.queryByText(MESSAGES.noneHeading)).toBeNull();
    expect(screen.getByText(MESSAGES.couldntLoad)).toBeTruthy();

    server.queueStatus = undefined;
    await fireEvent.press(screen.getByText(MESSAGES.tryAgain));
    await settle();
    expect(screen.getByText(MESSAGES.noneHeading)).toBeTruthy();
  });

  it("keeps the list and says so when a refresh fails", async () => {
    const server = serve(aQueue([aRow()]));
    await showScreen();

    server.dead = true;
    await act(async () => {
      await screen.getByTestId("payment-review-list").props.refreshControl.props.onRefresh();
    });

    expect(screen.getByText(SHOWING_LAST_LOADED_MESSAGE)).toBeTruthy();
    expect(screen.getByText("Jane S.")).toBeTruthy();
  });

  it("doesn't call it caught up when it cleared what it loaded and more are waiting", async () => {
    const server = serve(aQueue([aRow()], 2));
    await showScreen();
    server.queueStatus = 500;

    await fireEvent.press(screen.getByText("Yes, it's Jane Smith"));
    await settle();

    expect(screen.queryByText(MESSAGES.noneHeading)).toBeNull();
    expect(screen.getByText(MESSAGES.couldntLoad)).toBeTruthy();
  });

  it("shows the payment, the guess and the count, and no ids or raw confidence", async () => {
    serve(aQueue([aRow()]));
    await showScreen();

    expect(screen.getByText("1 payment to review")).toBeTruthy();
    expect(screen.getByText("$1,200.00")).toBeTruthy();
    expect(screen.getByText("March rent")).toBeTruthy();
    expect(screen.getByText("Looks like Jane Smith.")).toBeTruthy();
    expect(screen.getByText("Yes, it's Jane Smith")).toBeTruthy();
    expect(screen.getByText(MESSAGES.someoneElse)).toBeTruthy();
    expect(screen.queryByText(/fuzzy|pending/i)).toBeNull();
  });

  it("says how many more are waiting past the ones it loaded", async () => {
    serve(aQueue([aRow()], 4));
    await showScreen();

    expect(screen.getByText("4 payments to review")).toBeTruthy();
    expect(screen.getByText(moreWaitingLine(3))).toBeTruthy();
  });

  it("offers a picker when a guessed tenant has since been deleted, whatever the confidence says", async () => {
    serve(aQueue([aRow({ confidence: "fuzzy", proposed_applicant_id: null, proposed_applicant: null })]));
    await showScreen();

    expect(screen.getByText(MESSAGES.noTenantGuess)).toBeTruthy();
    expect(screen.getByText(MESSAGES.chooseTenant)).toBeTruthy();
    expect(screen.queryByText(/Yes, it's/)).toBeNull();
  });

  it("shows a row whose transaction is gone without inventing an amount", async () => {
    serve(aQueue([aRow({ transaction: null })]));
    await showScreen();

    expect(screen.getByText(MESSAGES.someone)).toBeTruthy();
    expect(screen.queryByText(/\$/)).toBeNull();
  });

  it("gives a viewer the list and no way to change it", async () => {
    jest.mocked(useCanWrite).mockReturnValue(false);
    serve(aQueue([aRow()]));
    await showScreen();

    expect(screen.getByText(MESSAGES.viewOnly)).toBeTruthy();
    expect(screen.getByText("Looks like Jane Smith.")).toBeTruthy();
    expect(screen.queryByText("Yes, it's Jane Smith")).toBeNull();
    expect(screen.queryByText(MESSAGES.skip)).toBeNull();
  });

  it("loads no tenants or properties until a picker is opened", async () => {
    const server = serve(aQueue([aRow(), aPayout()]));
    await showScreen();
    await settle();

    expect(server.tenantReads).toBe(0);
    expect(server.propertyReads).toBe(0);
  });
});

describe("confirming a guess", () => {
  it("links the tenant it showed in one tap, takes the row off and says what it'll remember", async () => {
    const server = serve(aQueue([aRow()]));
    await showScreen();

    await fireEvent.press(screen.getByText("Yes, it's Jane Smith"));
    await settle();

    expect(server.sent).toEqual([{ url: `${QUEUE_URL}/r1/confirm`, body: { applicant_id: "a1", property_id: null } }]);
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(screen.getByText("Linked to Jane Smith. I'll remember that Jane S. pays for them.")).toBeTruthy();
    expect(screen.queryByText("Yes, it's Jane Smith")).toBeNull();
    expect(screen.getByText(MESSAGES.noneHeading)).toBeTruthy();
  });

  it("takes the row off even when the reload after it fails, so it can't be tapped again", async () => {
    const server = serve(aQueue([aRow(), aPayout()]));
    await showScreen();
    server.queueStatus = 500;

    await fireEvent.press(screen.getByText("Yes, it's Jane Smith"));
    await settle();

    expect(screen.queryByText("Yes, it's Jane Smith")).toBeNull();
    expect(screen.getByText("Assign to Sunset Villa")).toBeTruthy();
    expect(screen.getByText("1 payment to review")).toBeTruthy();
  });

  it("refreshes that transaction, since confirming changes its category and status", async () => {
    const server = serve(aQueue([aRow()]));
    await showScreen();
    await act(async () => {
      store.dispatch(transactionsApi.endpoints.getTransaction.initiate("tx1"));
    });
    await settle();
    server.otherReads.length = 0;

    await fireEvent.press(screen.getByText("Yes, it's Jane Smith"));
    await settle();

    expect(server.otherReads).toContain("/transactions/tx1");
  });

  it("doesn't promise to remember a payer it doesn't have", async () => {
    const row = aRow();
    serve(aQueue([aRow({ transaction: row.transaction && { ...row.transaction, payer_name: null } })]));
    await showScreen();

    await fireEvent.press(screen.getByText("Yes, it's Jane Smith"));
    await settle();

    expect(screen.getByText("Linked to Jane Smith.")).toBeTruthy();
  });

  it("assigns a payout to the property it showed", async () => {
    const server = serve(aQueue([aPayout()]));
    await showScreen();

    expect(screen.getByText("Looks like a payout for Sunset Villa.")).toBeTruthy();
    await fireEvent.press(screen.getByText("Assign to Sunset Villa"));
    await settle();

    expect(server.sent[0]).toEqual({ url: `${QUEUE_URL}/r2/confirm`, body: { applicant_id: null, property_id: "p1" } });
    expect(screen.getByText("Booked to Sunset Villa.")).toBeTruthy();
  });

  it("sends one request when tapped twice before the button can disable itself", async () => {
    const server = serve(aQueue([aRow()]));
    const { result } = await renderHook(() => usePaymentReviewActions(aRow()), { wrapper: Screen });

    await act(async () => {
      await Promise.all([
        result.current.linkTenant({ id: "a1", name: "Jane Smith" }),
        result.current.linkTenant({ id: "a1", name: "Jane Smith" }),
      ]);
    });

    expect(server.sent).toHaveLength(1);
  });
});

describe("picking someone else", () => {
  it("asks before linking a picked tenant, then sends the picked one", async () => {
    const server = serve(aQueue([aRow()]));
    await showScreen();

    await fireEvent.press(screen.getByText(MESSAGES.someoneElse));
    await settle();
    expect(screen.getByText(TENANT_PICKER_MESSAGES.title)).toBeTruthy();
    expect(screen.getByText("$1,200.00 from Jane S. on Mar 3.")).toBeTruthy();
    expect(screen.getByText("Past Person (ended)")).toBeTruthy();

    await fireEvent.press(screen.getByText("Omar Reyes"));
    expect(Alert.alert).not.toHaveBeenCalled();
    await finishClosing();

    const [title, body] = jest.mocked(Alert.alert).mock.calls[0];
    expect(title).toBe("Link this payment to Omar Reyes?");
    expect(body).toContain("Jane S. pays for them");
    expect(server.sent).toEqual([]);

    await pressAlert(MESSAGES.link);
    expect(server.sent[0].body).toEqual({ applicant_id: "a2", property_id: null });
    expect(screen.getByText("Linked to Omar Reyes. I'll remember that Jane S. pays for them.")).toBeTruthy();
  });

  it("sends nothing when the question is cancelled", async () => {
    const server = serve(aQueue([aRow()]));
    await showScreen();

    await fireEvent.press(screen.getByText(MESSAGES.someoneElse));
    await settle();
    await fireEvent.press(screen.getByText("Omar Reyes"));
    await finishClosing();
    await pressAlert("Cancel");

    expect(server.sent).toEqual([]);
    expect(screen.getByText("Yes, it's Jane Smith")).toBeTruthy();
  });

  it("does nothing when the sheet closes without a pick", async () => {
    const server = serve(aQueue([aRow()]));
    await showScreen();

    await fireEvent.press(screen.getByText(MESSAGES.someoneElse));
    await settle();
    await fireEvent.press(screen.getByText("Close"));
    await finishClosing();

    expect(Alert.alert).not.toHaveBeenCalled();
    expect(server.sent).toEqual([]);
  });

  it("says so when the tenants won't load, instead of saying there are none", async () => {
    const server = serve(aQueue([aRow()]));
    server.tenantsFail = true;
    await showScreen();

    await fireEvent.press(screen.getByText(MESSAGES.someoneElse));
    await settle();

    expect(screen.getByText(TENANT_PICKER_MESSAGES.failed)).toBeTruthy();
    expect(screen.queryByText(TENANT_PICKER_MESSAGES.none)).toBeNull();
  });

  it("books a picked property without asking, and leaves out inactive ones", async () => {
    const server = serve(aQueue([aPayout({ proposed_property_id: null, proposed_property: null })]));
    await showScreen();

    expect(screen.getByText(MESSAGES.noPropertyGuess)).toBeTruthy();
    await fireEvent.press(screen.getByText(MESSAGES.chooseProperty));
    await settle();
    expect(screen.getByText(MESSAGES.propertySheetTitle)).toBeTruthy();
    expect(screen.queryByText("Sold House")).toBeNull();

    await fireEvent.press(screen.getByText("Oak Cottage"));
    await finishClosing();

    expect(Alert.alert).not.toHaveBeenCalled();
    expect(server.sent[0].body).toEqual({ applicant_id: null, property_id: "p2" });
    expect(screen.getByText("Booked to Oak Cottage.")).toBeTruthy();
  });
});

describe("skipping", () => {
  it("asks first, and a skip says the payment is still there", async () => {
    const server = serve(aQueue([aRow()]));
    await showScreen();

    await fireEvent.press(screen.getByText(MESSAGES.skip));
    expect(server.sent).toEqual([]);
    expect(jest.mocked(Alert.alert).mock.calls[0][0]).toBe(MESSAGES.skipTitle);

    await pressAlert(MESSAGES.skip);

    expect(server.sent).toEqual([{ url: `${QUEUE_URL}/r1/reject`, body: {} }]);
    expect(screen.getByText(MESSAGES.skipped)).toBeTruthy();
    expect(screen.getByText(MESSAGES.noneHeading)).toBeTruthy();
  });
});

describe("when the server refuses", () => {
  async function tapYes(server: Server, reply: Reply) {
    server.reply = reply;
    await showScreen();
    await fireEvent.press(screen.getByText("Yes, it's Jane Smith"));
    await settle();
  }

  it("keeps the row when the save fails, and never shows the server's words", async () => {
    const server = serve(aQueue([aRow()]));
    await tapYes(server, refusal(500, "Traceback secret"));

    expect(screen.getByText(MESSAGES.couldntSave)).toBeTruthy();
    expect(screen.queryByText(/Traceback/)).toBeNull();
    expect(screen.getByText("Yes, it's Jane Smith")).toBeTruthy();
  });

  it("drops a row someone already handled once the list reloads, with no error tone", async () => {
    const server = serve(aQueue([aRow()]));
    server.reply = refusal(422, DETAILS.alreadyResolved);
    await showScreen();
    server.queue = aQueue([]);

    await fireEvent.press(screen.getByText("Yes, it's Jane Smith"));
    await settle();

    expect(screen.getByText(MESSAGES.alreadyHandled)).toBeTruthy();
    expect(screen.getByText(MESSAGES.noneHeading)).toBeTruthy();
  });

  it.each([
    [refusal(404, "Review item not found"), MESSAGES.gone],
    [refusal(404, "Transaction not found"), MESSAGES.gone],
    [refusal(404, DETAILS.applicantGone), MESSAGES.tenantGone],
    [refusal(404, DETAILS.propertyGone), MESSAGES.propertyGone],
    [refusal(422, DETAILS.alreadyResolved), MESSAGES.alreadyHandled],
    [refusal(422, DETAILS.noTarget), MESSAGES.noTarget],
    [refusal(403, "Forbidden"), MESSAGES.viewerRefused],
    [refusal(500, "boom"), MESSAGES.couldntSave],
    [{ status: undefined, data: undefined }, MESSAGES.unreachable],
  ])("tells %j apart", (error, message) => {
    expect(reviewFailureMessage(error)).toBe(message);
  });

  it("counts only an already resolved row as nothing wrong", () => {
    expect(wasAlreadyHandled(refusal(422, DETAILS.alreadyResolved))).toBe(true);
    expect(wasAlreadyHandled(refusal(422, DETAILS.noTarget))).toBe(false);
  });
});

describe("display helpers", () => {
  it("treats no channel and direct as rent, and anything else as a payout, like the website", () => {
    const row = aRow();
    const withChannel = (channel: string | null) => aRow({ transaction: row.transaction && { ...row.transaction, channel } });

    expect(isPayout(withChannel(null))).toBe(false);
    expect(isPayout(withChannel("direct"))).toBe(false);
    expect(isPayout(withChannel("airbnb"))).toBe(true);
    expect(isPayout(aRow({ transaction: null }))).toBe(false);
  });

  it("ignores a stray proposal of the wrong kind", () => {
    expect(proposedTarget(aPayout({ proposed_property: null, proposed_applicant: { id: "a1", legal_name: "Jane" } }))).toBeNull();
  });

  it("names an unnamed tenant plainly", () => {
    expect(proposedTarget(aRow({ proposed_applicant: { id: "a1", legal_name: null } }))?.name).toBe(TENANT_PICKER_MESSAGES.thisTenant);
  });

  it("reads the whole payment to a screen reader", () => {
    expect(rowLabel(aRow())).toBe("Rent payment from Jane S., 1,200 dollars, March 3, 2026, memo March rent. Looks like Jane Smith.");
  });

  it("starts every button's spoken label with the words on the button", () => {
    const rent = aRow();
    const noGuess = aRow({ proposed_applicant: null });
    expect(confirmActionLabel(rent, { name: "Jane Smith" })).toBe("Yes, it's Jane Smith, for the payment of 1,200 dollars from Jane S.");
    expect(pickActionLabel(rent)).toMatch(new RegExp(`^${MESSAGES.someoneElse}`));
    expect(pickActionLabel(noGuess)).toMatch(new RegExp(`^${MESSAGES.chooseTenant}`));
    expect(pickActionLabel(aPayout())).toMatch(new RegExp(`^${MESSAGES.anotherProperty}`));
    expect(skipActionLabel(rent)).toMatch(new RegExp(`^${MESSAGES.skip}`));
  });

  it("counts in the right number", () => {
    expect(queueCountLine(1)).toBe("1 payment to review");
    expect(queueCountLine(2)).toBe("2 payments to review");
    expect(moreWaitingLine(1)).toBe("1 more is waiting. They'll show up as you finish these.");
  });
});
