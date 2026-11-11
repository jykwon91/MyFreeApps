import type { InfinitePagesState } from "./infinite-pages-state";

/** `InfinitePagesState` plus the two things a screen can do with it. */
export interface InfinitePagesResult<T> extends InfinitePagesState<T> {
  loadMore: () => void;
  /** Reload every loaded page. */
  refetch: () => Promise<unknown>;
}
