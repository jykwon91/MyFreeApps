import type { MergeableField } from "@mybookkeeper/api-client/types/transaction/MergeableField";
import type { MergeFieldSide } from "@mybookkeeper/api-client/types/transaction/MergeFieldSide";

/** Which record's value wins for each field a merge can choose between. */
export type MergeChoices = Record<MergeableField, MergeFieldSide>;
