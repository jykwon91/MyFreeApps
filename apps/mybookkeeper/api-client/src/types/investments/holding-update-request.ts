import type { HoldingCreateRequest } from "./holding-create-request";

/** Partial edit of a hand-entered holding; omitted fields stay as they are. */
export type HoldingUpdateRequest = Partial<Omit<HoldingCreateRequest, "financial_account_id">>;
