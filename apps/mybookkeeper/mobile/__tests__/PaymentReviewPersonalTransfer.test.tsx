import { attributionApi } from "@mybookkeeper/api-client/store/attributionApi";
import type { AttributionReviewItem } from "@mybookkeeper/api-client/types/attribution/attribution-review-item";
import type { AttributionReviewQueueResponse } from "@mybookkeeper/api-client/types/attribution/attribution-review-queue-response";
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { AxiosAdapter, AxiosRequestConfig } from "axios";
import type { ReactNode } from "react";
import { Provider } from "react-redux";
import { PAYMENT_REVIEW_MESSAGES as MESSAGES } from "../src/constants/paymentReview";
import { personalTransferActionLabel } from "../src/features/paymentReview/paymentReviewDisplay";
import PaymentReviewScreen from "../src/features/paymentReview/PaymentReviewScreen";
import { statusLabel } from "../src/features/transactions/transactionDisplay";
import { useCanWrite } from "../src/features/workspace/useCanWrite";
import { store } from "../src/lib/store";

jest.mock("expo-router", () => ({ useFocusEffect: () => undefined, router: { push: jest.fn(), navigate: jest.fn(), back: jest.fn(), canGoBack: () => true } }));
jest.mock("../src/features/workspace/useCanWrite", () => ({ useCanWrite: jest.fn() }));

const QUEUE_URL = "/transactions/attribution-review-queue";
const originalAdapter = api.defaults.adapter;

function aRent(): AttributionReviewItem {
  return {
    id: "r1",
    transaction_id: "tx1",
    proposed_applicant_id: null,
    proposed_property_id: null,
    confidence: "unmatched",
    status: "pending",
    created_at: "2026-03-03T12:00:00Z",
    resolved_at: null,
    transaction: {
      id: "tx1",
      transaction_date: "2026-03-03",
      amount: "384.75",
      vendor: "Zelle",
      payer_name: "Dao Nguyen",
      description: "Zelle payment from DAO NGUYEN",
      property_id: null,
      channel: null,
    },
    proposed_applicant: null,
    proposed_property: null,
  };
}

function aPayout(): AttributionReviewItem {
  const row = aRent();
  return {
    ...row,
    id: "r2",
    transaction_id: "tx2",
    transaction: row.transaction && { ...row.transaction, id: "tx2", channel: "airbnb", payer_name: null, vendor: "Airbnb" },
  };
}

interface Server {
  queue: AttributionReviewQueueResponse;
  sent: { method: string; url: string; body: unknown }[];
  markStatus: number;
}

function serve(items: AttributionReviewItem[]): Server {
  const server: Server = { queue: { items, total: items.length, pending_count: items.length }, sent: [], markStatus: 200 };
  const adapter: AxiosAdapter = async (config: AxiosRequestConfig & { url?: string }) => {
    const url = config.url ?? "";
    const respond = (status: number, data: unknown) => {
      const response = { data, status, statusText: "", headers: {}, config } as never;
      if (status >= 400) throw Object.assign(new Error("refused"), { isAxiosError: true, response, config });
      return response;
    };
    if (url === QUEUE_URL) return respond(200, server.queue);
    if (url.endsWith("/personal-transfer")) {
      server.sent.push({ method: config.method ?? "", url, body: null });
      if (server.markStatus !== 200) return respond(server.markStatus, {});
      server.queue = { items: [], total: 0, pending_count: 0 };
      return respond(200, {
        transaction_id: "tx1",
        remembered_sender: { id: "s1", display_name: "Dao Nguyen", payer_handle: "" },
        also_cleared: 2,
      });
    }
    if (url.endsWith("/personal-transfer/undo")) {
      server.sent.push({ method: config.method ?? "", url, body: JSON.parse(String(config.data)) });
      return respond(200, { transaction_id: "tx1", status: "pending", back_in_review: true, forgotten_senders: 1 });
    }
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
  await waitFor(() => expect(screen.queryByTestId("payment-review-skeleton")).toBeNull());
}

beforeEach(() => {
  store.dispatch(baseApi.util.resetApiState());
  jest.mocked(useCanWrite).mockReturnValue(true);
});

afterAll(() => {
  api.defaults.adapter = originalAdapter;
});

describe("Personal transfer on Payment Review", () => {
  it("marks a rent payment, says what it cleared, and takes the row off", async () => {
    const server = serve([aRent()]);
    await showScreen();
    await act(async () => {
      fireEvent.press(screen.getByLabelText(personalTransferActionLabel(aRent())));
    });
    expect(await screen.findByText(
      "Marked as a personal transfer. I'll skip Dao Nguyen's payments from now on. I also cleared 2 more payments from them.",
    )).toBeTruthy();
    expect(server.sent[0]).toEqual({ method: "put", url: "/transactions/tx1/personal-transfer", body: null });
    await waitFor(() => expect(screen.getByText(MESSAGES.noneHeading)).toBeTruthy());
  });

  it("Undo un-marks it and forgets the sender", async () => {
    const server = serve([aRent()]);
    await showScreen();
    await act(async () => {
      fireEvent.press(screen.getByLabelText(personalTransferActionLabel(aRent())));
    });
    await act(async () => {
      fireEvent.press(await screen.findByText(MESSAGES.undo));
    });
    await waitFor(() =>
      expect(server.sent[1]).toEqual({ method: "post", url: "/transactions/tx1/personal-transfer/undo", body: { forget_sender: true } }),
    );
    expect(await screen.findByText(
      "Got it, that's not a personal transfer. It's back in Payment Review. I'll stop skipping that sender too.",
    )).toBeTruthy();
  });

  it("keeps the row and explains when the mark fails", async () => {
    const server = serve([aRent()]);
    server.markStatus = 500;
    await showScreen();
    await act(async () => {
      fireEvent.press(screen.getByLabelText(personalTransferActionLabel(aRent())));
    });
    expect(await screen.findByText(MESSAGES.couldntSave)).toBeTruthy();
    expect(screen.getByLabelText(personalTransferActionLabel(aRent()))).toBeTruthy();
  });

  it("isn't offered on booking-site payouts or to viewers", async () => {
    serve([aPayout()]);
    await showScreen();
    expect(screen.queryByLabelText(personalTransferActionLabel(aPayout()))).toBeNull();

    store.dispatch(baseApi.util.resetApiState());
    jest.mocked(useCanWrite).mockReturnValue(false);
    serve([aRent()]);
    await showScreen();
    expect(screen.queryByLabelText(personalTransferActionLabel(aRent()))).toBeNull();
  });

  it("labels a marked transaction", () => {
    expect(statusLabel("personal_transfer")).toBe("Personal transfer");
  });
});
