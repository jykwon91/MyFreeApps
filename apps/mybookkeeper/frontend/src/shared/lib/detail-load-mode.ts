import type { DetailLoadMode } from "@/shared/types/detail-load-mode";
import type { DetailLoadModeArgs } from "@/shared/types/detail-load-mode-args";

/**
 * Resolves what a detail page's body shows. The page shows its error alert
 * whenever `error` is set, above whatever this returns.
 *
 * Decides on data and `error` rather than `isLoading`/`isError`. While a failed
 * load is retried, RTK reports isLoading=false and isError=false with no data,
 * which pages reading those flags showed as a blank page or a skeleton in place
 * of the error. `error` stays set until a retry succeeds, so the error and its
 * "Retrying..." button stay up instead.
 *
 * A record that loaded earlier stays visible when a refresh fails.
 */
export function resolveDetailLoadMode({ hasData, hasError }: DetailLoadModeArgs): DetailLoadMode {
  if (hasData) return "content";
  return hasError ? "error" : "loading";
}
