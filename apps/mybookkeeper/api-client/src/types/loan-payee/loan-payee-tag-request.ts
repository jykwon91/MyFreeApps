import type { LoanPayeeKind } from "./loan-payee-kind";

export interface LoanPayeeTagRequest {
  transactionId: string;
  kind: LoanPayeeKind;
}
