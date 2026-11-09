import type { WriteFailure } from "@mybookkeeper/api-client/types/write/write-failure";

/** What to tell the person for each way a write can fail. */
export type WriteFailureCopy = Record<WriteFailure, string>;
