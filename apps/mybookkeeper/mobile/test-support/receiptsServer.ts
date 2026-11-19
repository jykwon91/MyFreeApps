import type { PendingReceipt } from "@mybookkeeper/api-client/types/lease/pending-receipt";
import type { PendingReceiptListResponse } from "@mybookkeeper/api-client/types/lease/pending-receipt-list-response";
import type { ReceiptGmailState } from "@mybookkeeper/api-client/types/lease/receipt-gmail-state";
import api from "@platform/core/lib/api";
import type { AxiosAdapter, AxiosRequestConfig } from "axios";
import { GMAIL_CONNECT_URL, GOOGLE_AUTH_URL } from "./googleAuthUrl";

export const PENDING_URL = "/rent-receipts/pending";
/** The most receipts the real server answers per list request (`limit: Query(le=500)`); more is refused with a 422. */
export const SERVER_LIMIT_CAP = 500;

/** The Receipts list's loaded pages in the store, read straight from its cache entry. */
export function cachedReceiptPages(state: { api: { queries: Record<string, { data?: unknown } | undefined> } }): PendingReceiptListResponse[] {
  const entry = state.api.queries["listPendingReceiptPages(undefined)"]?.data as { pages: PendingReceiptListResponse[] } | undefined;
  return entry?.pages ?? [];
}

export function aReceipt(overrides: Partial<PendingReceipt> = {}): PendingReceipt {
  return {
    id: "pr1",
    transaction_id: "tx1",
    applicant_id: "a1",
    signed_lease_id: "l1",
    period_start_date: "2026-06-01",
    period_end_date: "2026-06-30",
    status: "pending",
    sent_at: null,
    sent_via_attachment_id: null,
    created_at: "2026-06-03T12:00:00Z",
    tenant_name: "Jane Smith",
    amount: "1450.00",
    transaction_date: "2026-06-03",
    payer_name: "Jane Smith",
    payment_method: null,
    vendor: "Zelle",
    send_blocker: null,
    sent_from_other_gmail: null,
    ...overrides,
  };
}

/** A reply to a write. `noAnswer` is a request whose answer never arrives. */
export type FakeReply = { status: number; detail?: string | Record<string, string> } | "noAnswer";

export interface FakeReceiptServer {
  receipts: PendingReceipt[];
  /** Open receipts on the server, past the ones returned. Defaults to the list's length. */
  pendingCount: number | null;
  gmailState: ReceiptGmailState;
  /** Fails reads (the list's pages and one receipt's lookup) with this status while set. */
  listStatus: number | null;
  /** No answer to anything while set. */
  offline: boolean;
  sendReply: FakeReply | null;
  /** With `noAnswer`, whether the send happened anyway. */
  sendLandsAnyway: boolean;
  dismissReply: FakeReply | null;
  /** Runs before a read answers, to change what it says. */
  beforeListRead: (() => void) | null;
  writes: { url: string; body: unknown }[];
  /** Every read: the list's pages and one receipt's lookups. */
  listReads: AxiosRequestConfig[];
  /** Every request to start connecting Gmail. */
  connectStarts: AxiosRequestConfig[];
}

/** Answers the receipts endpoints, so a screen test runs through the real API client. */
export function startReceiptServer(receipts: PendingReceipt[]): FakeReceiptServer {
  const server: FakeReceiptServer = {
    receipts,
    pendingCount: null,
    gmailState: "ready",
    listStatus: null,
    offline: false,
    sendReply: null,
    sendLandsAnyway: false,
    dismissReply: null,
    beforeListRead: null,
    writes: [],
    listReads: [],
    connectStarts: [],
  };
  const adapter: AxiosAdapter = async (config) => {
    const url = config.url ?? "";
    const respond = (status: number, data: unknown) => {
      const response = { data, status, statusText: "", headers: {}, config } as never;
      if (status >= 400) throw Object.assign(new Error("refused"), { isAxiosError: true, response, config });
      return response;
    };
    const noAnswer = () => Object.assign(new Error("Network Error"), { isAxiosError: true, config });
    const remove = (transactionId: string) => {
      const before = server.receipts.length;
      server.receipts = server.receipts.filter((receipt) => receipt.transaction_id !== transactionId);
      if (server.pendingCount !== null && server.receipts.length < before) server.pendingCount -= 1;
    };
    if (server.offline) throw noAnswer();
    if (url === GMAIL_CONNECT_URL) {
      server.connectStarts.push(config);
      return respond(200, { auth_url: GOOGLE_AUTH_URL });
    }
    if (url === PENDING_URL || url.startsWith(`${PENDING_URL}/`)) {
      server.listReads.push(config);
      server.beforeListRead?.();
      if (server.listStatus) return respond(server.listStatus, { detail: "nope" });
      if (url !== PENDING_URL) {
        const lookedUp = url.slice(PENDING_URL.length + 1);
        const item = server.receipts.find((receipt) => receipt.transaction_id === lookedUp) ?? null;
        return respond(200, { item, gmail_state: server.gmailState });
      }
      const params = (config.params ?? {}) as { limit?: number; offset?: number };
      const limit = Number(params.limit ?? 100);
      const offset = Number(params.offset ?? 0);
      if (!(limit >= 1 && limit <= SERVER_LIMIT_CAP)) return respond(422, { detail: "limit out of range" });
      const count = server.pendingCount ?? server.receipts.length;
      const items = server.receipts.slice(offset, offset + limit);
      return respond(200, { items, total: count, has_more: offset + items.length < count, pending_count: count, gmail_state: server.gmailState });
    }
    const [, , transactionId, action] = url.split("/");
    server.writes.push({ url, body: config.data ? JSON.parse(String(config.data)) : undefined });
    const reply = action === "send" ? server.sendReply : server.dismissReply;
    if (reply === "noAnswer") {
      if (action === "send" && server.sendLandsAnyway) remove(transactionId);
      throw noAnswer();
    }
    if (reply) return respond(reply.status, { detail: reply.detail ?? "refused" });
    remove(transactionId);
    return action === "send" ? respond(200, { receipt_number: "R-2026-0007", attachment_id: "att1" }) : respond(204, null);
  };
  api.defaults.adapter = adapter;
  return server;
}
