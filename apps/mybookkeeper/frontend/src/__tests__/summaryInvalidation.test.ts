import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { configureStore } from "@reduxjs/toolkit";
import { baseApi } from "@/shared/store/baseApi";
// Side-effect imports: register endpoints on the shared baseApi instance.
import "@/shared/store/documentsApi";
import "@/shared/store/integrationsApi";
import "@/shared/store/plaidApi";
import "@/shared/store/transactionsApi";
import "@/shared/store/summaryApi";

// Mock the axios instance used by the baseQuery so mutations and queries can
// "succeed" without a network. The baseQuery calls `api({ url, method, ... })`.
vi.mock("@/shared/lib/api", () => {
  const fn = vi.fn(async ({ url }: { url: string }) => {
    if (url === "/summary") return { data: { revenue: 0, expenses: 0, profit: 0, by_month: [], by_property: [], by_property_month: [], by_category: {}, by_month_expense: [] } };
    return { data: { id: "stub", status: "ok" } };
  });
  return { default: fn };
});

// Import AFTER the mock so the mocked module is used
const apiModule = await import("@/shared/lib/api");
const mockedApi = apiModule.default as unknown as ReturnType<typeof vi.fn>;

function buildTestStore() {
  return configureStore({
    reducer: { [baseApi.reducerPath]: baseApi.reducer },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(baseApi.middleware),
  });
}

type EndpointsMap = Record<
  string,
  {
    initiate: (arg?: unknown) => unknown;
  }
>;

/**
 * Test that dispatching `mutationName` causes the getSummary query to be refetched
 * (i.e., Summary tag is invalidated).
 */
async function assertInvalidatesSummary(
  mutationName: string,
  mutationArg: unknown,
): Promise<void> {
  const store = buildTestStore();
  const endpoints = (baseApi as unknown as { endpoints: EndpointsMap }).endpoints;

  // Prime the summary query so it's cached
  const sub = store.dispatch(
    endpoints.getSummary.initiate() as Parameters<typeof store.dispatch>[0],
  ) as unknown as { unsubscribe: () => void };
  // Wait for the query to resolve
  await new Promise((r) => setTimeout(r, 10));
  const baseCalls = mockedApi.mock.calls.filter((c) => (c[0] as { url: string }).url === "/summary").length;
  expect(baseCalls).toBeGreaterThanOrEqual(1);

  // Dispatch the mutation
  const action = endpoints[mutationName].initiate(mutationArg) as Parameters<typeof store.dispatch>[0];
  await store.dispatch(action);
  // Wait for invalidation cycle + automatic refetch
  await new Promise((r) => setTimeout(r, 10));

  const finalCalls = mockedApi.mock.calls.filter((c) => (c[0] as { url: string }).url === "/summary").length;
  expect(finalCalls).toBeGreaterThan(baseCalls);

  sub.unsubscribe();
}

describe("Summary cache invalidation on mutations", () => {
  beforeEach(() => {
    mockedApi.mockClear();
  });

  afterEach(() => {
    // Each test uses a fresh store; just clear calls
  });

  describe("documentsApi mutations invalidate Summary", () => {
    it("uploadDocument triggers summary refetch", async () => {
      const file = new File(["x"], "x.pdf", { type: "application/pdf" });
      await assertInvalidatesSummary("uploadDocument", { file });
    });

    it("deleteDocument triggers summary refetch", async () => {
      await assertInvalidatesSummary("deleteDocument", "doc-1");
    });

    it("bulkDeleteDocuments triggers summary refetch", async () => {
      await assertInvalidatesSummary("bulkDeleteDocuments", ["doc-1", "doc-2"]);
    });

    it("replaceFile triggers summary refetch", async () => {
      const file = new File(["x"], "x.pdf", { type: "application/pdf" });
      await assertInvalidatesSummary("replaceFile", { id: "doc-1", file });
    });

    it("reExtractDocument triggers summary refetch", async () => {
      await assertInvalidatesSummary("reExtractDocument", "doc-1");
    });

    it("toggleEscrowPaid triggers summary refetch", async () => {
      await assertInvalidatesSummary("toggleEscrowPaid", { id: "doc-1", is_escrow_paid: true });
    });

    it("cancelBatch triggers summary refetch", async () => {
      await assertInvalidatesSummary("cancelBatch", "batch-1");
    });
  });

  describe("integrationsApi mutations invalidate Summary", () => {
    it("syncGmail triggers summary refetch", async () => {
      await assertInvalidatesSummary("syncGmail", undefined);
    });

    it("retryQueueItem triggers summary refetch", async () => {
      await assertInvalidatesSummary("retryQueueItem", "queue-1");
    });

    it("retryAllFailed triggers summary refetch", async () => {
      await assertInvalidatesSummary("retryAllFailed", undefined);
    });

    it("extractAll triggers summary refetch", async () => {
      await assertInvalidatesSummary("extractAll", undefined);
    });
  });

  describe("plaidApi mutations invalidate Summary", () => {
    it("syncPlaidItem triggers summary refetch", async () => {
      await assertInvalidatesSummary("syncPlaidItem", "item-1");
    });
  });

  describe("transactionsApi mutations invalidate Summary", () => {
    it("createTransaction triggers summary refetch", async () => {
      await assertInvalidatesSummary("createTransaction", { amount: 1 });
    });

    it("updateTransaction triggers summary refetch", async () => {
      await assertInvalidatesSummary("updateTransaction", { id: "tx-1", data: { amount: 1 } });
    });

    it("deleteTransaction triggers summary refetch", async () => {
      await assertInvalidatesSummary("deleteTransaction", "tx-1");
    });

    it("bulkApproveTransactions triggers summary refetch", async () => {
      await assertInvalidatesSummary("bulkApproveTransactions", ["tx-1"]);
    });

    it("bulkDeleteTransactions triggers summary refetch", async () => {
      await assertInvalidatesSummary("bulkDeleteTransactions", ["tx-1"]);
    });

    it("mergeDuplicates triggers summary refetch", async () => {
      await assertInvalidatesSummary("mergeDuplicates", { keep_id: "tx-1", transaction_ids: ["tx-1", "tx-2"] });
    });
  });
});
