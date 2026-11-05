import type { PendingReceipt } from "@mybookkeeper/api-client/types/lease/pending-receipt";
import type { ReceiptGmailState } from "@mybookkeeper/api-client/types/lease/receipt-gmail-state";
import api from "@platform/core/lib/api";
import type { AxiosAdapter, AxiosRequestConfig } from "axios";

export const PENDING_URL = "/rent-receipts/pending";

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
    ...overrides,
  };
}

/** A reply to a write. `noAnswer` is a request whose answer never arrives. */
export type FakeReply = { status: number; detail?: string } | "noAnswer";

export interface FakeReceiptServer {
  receipts: PendingReceipt[];
  /** Open receipts on the server, past the ones returned. Defaults to the list's length. */
  pendingCount: number | null;
  gmailState: ReceiptGmailState;
  /** Fails list reads with this status while set. */
  listStatus: number | null;
  /** No answer to anything while set. */
  offline: boolean;
  sendReply: FakeReply | null;
  /** With `noAnswer`, whether the send happened anyway. */
  sendLandsAnyway: boolean;
  dismissReply: FakeReply | null;
  /** Runs before a list read answers, to change what it says. */
  beforeListRead: (() => void) | null;
  writes: { url: string; body: unknown }[];
  listReads: AxiosRequestConfig[];
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
    if (url === PENDING_URL) {
      server.listReads.push(config);
      server.beforeListRead?.();
      if (server.listStatus) return respond(server.listStatus, { detail: "nope" });
      const limit = Number((config.params as { limit?: number } | undefined)?.limit ?? 50);
      const count = server.pendingCount ?? server.receipts.length;
      return respond(200, { items: server.receipts.slice(0, limit), total: count, pending_count: count, gmail_state: server.gmailState });
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
