import type { MergeFieldSide } from "@mybookkeeper/api-client/types/transaction/MergeFieldSide";

/** What a duplicate review is waiting on, so only that button shows it. */
export type DuplicateAction = "merge" | "dismiss" | { keep: MergeFieldSide };
