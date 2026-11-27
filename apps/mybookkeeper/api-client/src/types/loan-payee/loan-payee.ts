import type { LoanPayeeKind } from "./loan-payee-kind";

/** Who a transaction paid, and whether payments to them count as a mortgage or a loan. */
export interface LoanPayee {
  /** The payee as Monthly expenses names it. */
  payee: string;
  /** null when the payee isn't tagged. */
  kind: LoanPayeeKind | null;
  /** Only money out to a named payee can be tagged. */
  can_tag: boolean;
}
