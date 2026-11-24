import type { FinancialAccountCreateRequest } from "./financial-account-create-request";

/** Only the fields sent change; ``closed_on: null`` reopens a closed account. */
export interface FinancialAccountUpdateRequest extends Partial<FinancialAccountCreateRequest> {
  closed_on?: string | null;
}
