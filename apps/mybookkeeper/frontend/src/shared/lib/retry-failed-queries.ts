import type { RetryableQuery } from "@/shared/types/retryable-query";

/**
 * Helpers for a card that shows one "couldn't load" alert for several queries.
 *
 * A query counts as failed from its failed attempt until one succeeds,
 * including while a retry is in flight. Reading RTK's ``isError`` instead
 * would drop the alert as soon as Retry is pressed, and with no data yet the
 * card would briefly read as empty — "nothing recorded", "all clear" — or
 * hide itself.
 */
export function hasFailedQuery(queries: readonly RetryableQuery[]): boolean {
  return queries.some((query) => query.error !== undefined);
}

/**
 * True once every failed query is being retried. While any failed query is
 * still idle, Retry stays enabled so it can be sent — even if another card's
 * Retry has already started on a query this card shares.
 */
export function isRetryingFailedQuery(queries: readonly RetryableQuery[]): boolean {
  const failed = queries.filter((query) => query.error !== undefined);
  return failed.length > 0 && failed.every((query) => query.isFetching);
}

/**
 * Refetch every failed query that isn't already being retried. Retrying only
 * the card's main query would leave it stuck on the error whenever another
 * query was the one that failed.
 */
export function retryFailedQueries(queries: readonly RetryableQuery[]): void {
  for (const query of queries) {
    if (query.error !== undefined && !query.isFetching) void query.refetch();
  }
}
