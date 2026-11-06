/** A gathering guide's generated data while it loads. */
export type GatheringLoadState<T> =
  | { status: "loading" }
  | { status: "error"; retry: () => void }
  | { status: "ready"; data: T };
