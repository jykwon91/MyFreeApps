import type { ListLoadMode } from "@/shared/types/list-load-mode";
import type { ListLoadModeArgs } from "@/shared/types/list-load-mode-args";

/**
 * Resolves what a list page's body shows.
 *
 * Decides on data and `error` rather than `isLoading`/`isError`. While a failed
 * query is retried, RTK reports isLoading=false and isError=false with no data,
 * which a page reading those flags shows as "nothing here yet". `error` stays
 * set until a retry succeeds, so the page keeps its error up instead.
 *
 * Items that loaded earlier still show under the error (a failed refresh or a
 * failed "Load more" shouldn't wipe what's on screen).
 */
export function resolveListLoadMode({ hasData, hasError, itemCount }: ListLoadModeArgs): ListLoadMode {
  if (!hasData) return hasError ? "error" : "loading";
  if (itemCount > 0) return "list";
  // Never claim the list is empty while its latest load failed: after a filter
  // change that failed, `data` is still the previous filter's (empty) answer.
  return hasError ? "error" : "empty";
}
