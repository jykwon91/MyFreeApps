import { describe, it, expect, vi } from "vitest";
import {
  hasFailedQuery,
  isRetryingFailedQuery,
  retryFailedQueries,
} from "@/shared/lib/retry-failed-queries";
import type { RetryableQuery } from "@/shared/types/retryable-query";

const FAILURE = { status: 500 };

function query(overrides: Partial<RetryableQuery> = {}): RetryableQuery {
  return { error: undefined, isFetching: false, refetch: vi.fn(), ...overrides };
}

describe("hasFailedQuery", () => {
  it("is true while any query has failed, including mid-retry", () => {
    expect(hasFailedQuery([query(), query({ error: FAILURE })])).toBe(true);
    expect(hasFailedQuery([query({ error: FAILURE, isFetching: true })])).toBe(true);
  });

  it("is false when every query is healthy, even while one refreshes", () => {
    expect(hasFailedQuery([query(), query({ isFetching: true })])).toBe(false);
  });
});

describe("isRetryingFailedQuery", () => {
  it("is true while a failed query is fetching again", () => {
    expect(isRetryingFailedQuery([query({ error: FAILURE, isFetching: true })])).toBe(true);
  });

  it("ignores a healthy query's background refresh", () => {
    expect(isRetryingFailedQuery([query({ error: FAILURE }), query({ isFetching: true })])).toBe(false);
  });

  it("stays false while another failed query is still waiting to be retried", () => {
    // e.g. the other card's Retry started the shared plans query, but this
    // card's failed benchmarks query hasn't been sent yet.
    expect(
      isRetryingFailedQuery([query({ error: FAILURE, isFetching: true }), query({ error: FAILURE })]),
    ).toBe(false);
  });

  it("is false when nothing has failed", () => {
    expect(isRetryingFailedQuery([query({ isFetching: true })])).toBe(false);
  });
});

describe("retryFailedQueries", () => {
  it("refetches every failed query and leaves the healthy ones alone", () => {
    const failedA = query({ error: FAILURE });
    const healthy = query();
    const failedB = query({ error: FAILURE });

    retryFailedQueries([failedA, healthy, failedB]);

    expect(failedA.refetch).toHaveBeenCalledTimes(1);
    expect(failedB.refetch).toHaveBeenCalledTimes(1);
    expect(healthy.refetch).not.toHaveBeenCalled();
  });

  it("doesn't fire a second request for a query already being retried", () => {
    const retrying = query({ error: FAILURE, isFetching: true });
    retryFailedQueries([retrying]);
    expect(retrying.refetch).not.toHaveBeenCalled();
  });
});
