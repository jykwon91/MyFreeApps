import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { createElement, type ReactNode } from "react";
import { baseApi } from "@/shared/store/baseApi";
import { EMAIL_DERIVED_TAGS } from "@/shared/store/emailDerivedTags";
import { useInvalidateOnExtractionComplete } from "@/shared/hooks/useInvalidateOnExtractionComplete";
import type { EmailQueueItem } from "@/shared/types/integration/email-queue";

function buildTestStore() {
  return configureStore({
    reducer: { [baseApi.reducerPath]: baseApi.reducer },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(baseApi.middleware),
  });
}

function makeItem(id: string, status: EmailQueueItem["status"]): EmailQueueItem {
  return {
    id,
    sync_log_id: 1,
    attachment_filename: `${id}.pdf`,
    email_subject: `subject-${id}`,
    status,
    error: null,
    created_at: "2026-03-01T00:00:00Z",
  };
}

function wrapper({ store }: { store: ReturnType<typeof buildTestStore> }) {
  return ({ children }: { children: ReactNode }) =>
    createElement(Provider, { store, children });
}

describe("useInvalidateOnExtractionComplete", () => {
  let store: ReturnType<typeof buildTestStore>;
  let dispatchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    store = buildTestStore();
    dispatchSpy = vi.spyOn(store, "dispatch");
  });

  it("does not dispatch when queue is stable with no extracting items", () => {
    const queue: EmailQueueItem[] = [makeItem("a", "done"), makeItem("b", "fetched")];
    renderHook(() => useInvalidateOnExtractionComplete(queue), { wrapper: wrapper({ store }) });
    const invalidationCalls = dispatchSpy.mock.calls.filter((call: unknown[]) => {
      const action = call[0] as { type?: string };
      return typeof action?.type === "string" && action.type.includes("invalidateTags");
    });
    expect(invalidationCalls).toHaveLength(0);
  });

  it("does not dispatch on initial mount when items are already extracting", () => {
    const queue: EmailQueueItem[] = [makeItem("a", "extracting")];
    renderHook(() => useInvalidateOnExtractionComplete(queue), { wrapper: wrapper({ store }) });
    const invalidationCalls = dispatchSpy.mock.calls.filter((call: unknown[]) => {
      const action = call[0] as { type?: string };
      return typeof action?.type === "string" && action.type.includes("invalidateTags");
    });
    expect(invalidationCalls).toHaveLength(0);
  });

  it("dispatches invalidateTags when an item transitions from extracting to done", () => {
    const initialQueue: EmailQueueItem[] = [makeItem("a", "extracting")];
    const { rerender } = renderHook(
      ({ queue }: { queue: EmailQueueItem[] }) => useInvalidateOnExtractionComplete(queue),
      { wrapper: wrapper({ store }), initialProps: { queue: initialQueue } },
    );

    dispatchSpy.mockClear();
    const updatedQueue: EmailQueueItem[] = [makeItem("a", "done")];
    rerender({ queue: updatedQueue });

    const invalidationCalls = dispatchSpy.mock.calls.filter((call: unknown[]) => {
      const action = call[0] as { type?: string };
      return typeof action?.type === "string" && action.type.includes("invalidateTags");
    });
    expect(invalidationCalls.length).toBeGreaterThan(0);
    const action = invalidationCalls[0][0] as { payload?: unknown };
    expect(action.payload).toEqual(EMAIL_DERIVED_TAGS);
  });

  it("dispatches invalidateTags when an item transitions from extracting to failed", () => {
    const initialQueue: EmailQueueItem[] = [makeItem("a", "extracting")];
    const { rerender } = renderHook(
      ({ queue }: { queue: EmailQueueItem[] }) => useInvalidateOnExtractionComplete(queue),
      { wrapper: wrapper({ store }), initialProps: { queue: initialQueue } },
    );

    dispatchSpy.mockClear();
    const updatedQueue: EmailQueueItem[] = [makeItem("a", "failed")];
    rerender({ queue: updatedQueue });

    const invalidationCalls = dispatchSpy.mock.calls.filter((call: unknown[]) => {
      const action = call[0] as { type?: string };
      return typeof action?.type === "string" && action.type.includes("invalidateTags");
    });
    expect(invalidationCalls.length).toBeGreaterThan(0);
  });

  it("dispatches invalidateTags when an extracting item disappears from the queue", () => {
    const initialQueue: EmailQueueItem[] = [makeItem("a", "extracting"), makeItem("b", "extracting")];
    const { rerender } = renderHook(
      ({ queue }: { queue: EmailQueueItem[] }) => useInvalidateOnExtractionComplete(queue),
      { wrapper: wrapper({ store }), initialProps: { queue: initialQueue } },
    );

    dispatchSpy.mockClear();
    const updatedQueue: EmailQueueItem[] = [makeItem("b", "extracting")];
    rerender({ queue: updatedQueue });

    const invalidationCalls = dispatchSpy.mock.calls.filter((call: unknown[]) => {
      const action = call[0] as { type?: string };
      return typeof action?.type === "string" && action.type.includes("invalidateTags");
    });
    expect(invalidationCalls.length).toBeGreaterThan(0);
  });

  it("does not dispatch when items start extracting (fetched -> extracting is not a completion)", () => {
    const initialQueue: EmailQueueItem[] = [makeItem("a", "fetched")];
    const { rerender } = renderHook(
      ({ queue }: { queue: EmailQueueItem[] }) => useInvalidateOnExtractionComplete(queue),
      { wrapper: wrapper({ store }), initialProps: { queue: initialQueue } },
    );

    dispatchSpy.mockClear();
    const updatedQueue: EmailQueueItem[] = [makeItem("a", "extracting")];
    rerender({ queue: updatedQueue });

    const invalidationCalls = dispatchSpy.mock.calls.filter((call: unknown[]) => {
      const action = call[0] as { type?: string };
      return typeof action?.type === "string" && action.type.includes("invalidateTags");
    });
    expect(invalidationCalls).toHaveLength(0);
  });

  it("dispatches once per transition, not on every re-render with same queue", () => {
    const initialQueue: EmailQueueItem[] = [makeItem("a", "extracting")];
    const { rerender } = renderHook(
      ({ queue }: { queue: EmailQueueItem[] }) => useInvalidateOnExtractionComplete(queue),
      { wrapper: wrapper({ store }), initialProps: { queue: initialQueue } },
    );

    dispatchSpy.mockClear();
    const completedQueue: EmailQueueItem[] = [makeItem("a", "done")];
    rerender({ queue: completedQueue });
    // Rerender with the same-shape queue again — no new transition
    rerender({ queue: [makeItem("a", "done")] });

    const invalidationCalls = dispatchSpy.mock.calls.filter((call: unknown[]) => {
      const action = call[0] as { type?: string };
      return typeof action?.type === "string" && action.type.includes("invalidateTags");
    });
    expect(invalidationCalls).toHaveLength(1);
  });
  it("invalidates the pending-receipts tag, not just Transaction/Summary/Document", () => {
    // Regression: pending rent receipts are derived from transactions but cached
    // under SignedLease/RECEIPTS_PENDING, so a sync left them stale until reload.
    expect(EMAIL_DERIVED_TAGS).toContainEqual({ type: "SignedLease", id: "RECEIPTS_PENDING" });
  });

  it("dispatches when an item reaches done without ever being observed extracting", () => {
    // Slow polling (any page other than Integrations) can miss the "extracting"
    // window entirely; reaching a terminal status must still invalidate.
    const initialQueue: EmailQueueItem[] = [makeItem("a", "fetched")];
    const { rerender } = renderHook(
      ({ queue }: { queue: EmailQueueItem[] }) => useInvalidateOnExtractionComplete(queue),
      { wrapper: wrapper({ store }), initialProps: { queue: initialQueue } },
    );

    dispatchSpy.mockClear();
    rerender({ queue: [makeItem("a", "done")] });

    const invalidationCalls = dispatchSpy.mock.calls.filter((call: unknown[]) => {
      const action = call[0] as { type?: string };
      return typeof action?.type === "string" && action.type.includes("invalidateTags");
    });
    expect(invalidationCalls.length).toBeGreaterThan(0);
  });

  it("does not dispatch for terminal items already present on first observation", () => {
    const queue: EmailQueueItem[] = [makeItem("a", "done"), makeItem("b", "failed")];
    const { rerender } = renderHook(
      ({ queue }: { queue: EmailQueueItem[] }) => useInvalidateOnExtractionComplete(queue),
      { wrapper: wrapper({ store }), initialProps: { queue } },
    );
    rerender({ queue: [makeItem("a", "done"), makeItem("b", "failed")] });

    const invalidationCalls = dispatchSpy.mock.calls.filter((call: unknown[]) => {
      const action = call[0] as { type?: string };
      return typeof action?.type === "string" && action.type.includes("invalidateTags");
    });
    expect(invalidationCalls).toHaveLength(0);
  });
});
