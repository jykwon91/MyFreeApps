import type { QueryStatusFields } from "./types/query-status-fields";
import type { QueryStatusOptions } from "./types/query-status-options";

/**
 * The status fields of an RTK Query hook result, shaped the way RTK sets them.
 *
 * A failed query keeps ``error`` until an attempt succeeds, but ``isError``
 * goes false as soon as a retry starts. Mocks that set ``isError`` and
 * ``isFetching`` independently can describe states RTK never produces, and
 * tests built on them pass without exercising a real retry.
 */
export function queryStatus({ failed, fetching }: QueryStatusOptions): QueryStatusFields {
  return {
    isError: failed && !fetching,
    error: failed ? { status: 500, data: { detail: "Internal Server Error" } } : undefined,
    isFetching: fetching,
  };
}
