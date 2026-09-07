import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { configureStore } from "@reduxjs/toolkit";
import { baseApi, tagTypes } from "@/shared/store/baseApi";
import { EMAIL_DERIVED_TAGS } from "@/shared/store/emailDerivedTags";
import { rentReceiptsApi } from "@/shared/store/rentReceiptsApi";
import { integrationsApi } from "@/shared/store/integrationsApi";

vi.mock("@/shared/lib/api", () => ({ default: vi.fn() }));
import api from "@/shared/lib/api";

const mockedApi = api as unknown as ReturnType<typeof vi.fn>;

function buildStore() {
  return configureStore({
    reducer: { [baseApi.reducerPath]: baseApi.reducer },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(baseApi.middleware),
  });
}

/** Count how many times the pending-receipts endpoint was actually requested. */
function receiptFetchCount() {
  return mockedApi.mock.calls.filter(
    (call) => (call[0] as { url?: string })?.url === "/rent-receipts/pending",
  ).length;
}

describe("Gmail sync cache invalidation (real store + real tag graph)", () => {
  let store: ReturnType<typeof buildStore>;

  beforeEach(() => {
    mockedApi.mockReset();
    mockedApi.mockResolvedValue({ data: { items: [], total: 0 } });
    store = buildStore();
  });

  afterEach(() => {
    store.dispatch(baseApi.util.resetApiState());
  });

  it("refetches pending receipts after a sync — the reported bug", async () => {
    // A page is showing the pending-receipts list.
    const sub = store.dispatch(
      rentReceiptsApi.endpoints.getPendingReceipts.initiate(undefined),
    );
    await vi.waitFor(() => expect(receiptFetchCount()).toBe(1));

    // A Gmail sync runs and extracts a new rent payment.
    await store.dispatch(integrationsApi.endpoints.syncGmail.initiate());

    // The list must refetch on its own. Before the fix the sync invalidated only
    // Document/Summary/Transaction, so this stayed at 1 until a hard refresh.
    await vi.waitFor(() => expect(receiptFetchCount()).toBe(2));
    sub.unsubscribe();
  });

  it("refetches pending receipts when a background extraction finishes", async () => {
    const sub = store.dispatch(
      rentReceiptsApi.endpoints.getPendingReceipts.initiate(undefined),
    );
    await vi.waitFor(() => expect(receiptFetchCount()).toBe(1));

    // What useGmailSyncWatcher dispatches when an item leaves "extracting".
    store.dispatch(baseApi.util.invalidateTags(EMAIL_DERIVED_TAGS));

    await vi.waitFor(() => expect(receiptFetchCount()).toBe(2));
    sub.unsubscribe();
  });

  it("every tag in EMAIL_DERIVED_TAGS is a registered tag type", () => {
    // Guards against a typo silently becoming a no-op invalidation.
    const known = new Set<string>(tagTypes);
    for (const tag of EMAIL_DERIVED_TAGS) {
      const name = typeof tag === "string" ? tag : tag.type;
      expect(known).toContain(name);
    }
  });
});
